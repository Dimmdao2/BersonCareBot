'use client';

/**
 * Публичный поток входа (browser): OAuth, email и телефон с server-selected SMS/email delivery.
 * Apple — только если нет Яндекса/Google. Messenger Mini App keeps its separate phone step.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/patient/primitives/button';
import { Input } from '@/shared/ui/patient/primitives/input';
import { cn } from '@/lib/utils';
import { isMessengerMiniAppHost } from '@/shared/lib/messengerMiniApp';
import type { AuthMethodsPayload } from '@/modules/auth/checkPhoneMethods';
import {
  FAIL_CLOSED_AUTH_CHANNEL_UI_POLICY,
  filterAuthMethodsByChannelPolicy,
  isOtpChannelAvailablePublic,
  OTP_PUBLIC_OTHER_CHANNELS_ORDER,
  pickOtpChannelWithPreferencePublic,
  type AuthChannelUiPolicy,
} from '@/modules/auth/otpChannelUi';
import { getPostAuthRedirectTarget } from '@/modules/auth/redirectPolicy';
import { markFreshLoginAfterAuth } from '@/shared/lib/webPush/freshLoginStorage';
import { ChannelPicker } from '@/shared/ui/patient/auth/ChannelPicker';
import {
  OtpCodeForm,
  type OtpAlternativeEntry,
  type OtpResendOutcome,
} from '@/shared/ui/patient/auth/OtpCodeForm';
import { InternationalPhoneInput } from '@/shared/ui/patient/auth/InternationalPhoneInput';
import {
  AUTH_LOGIN_ACCENT_TEXT_CLASS,
  AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS,
  AUTH_LOGIN_OUTLINE_BUTTON_CLASS,
  AUTH_LOGIN_PRIMARY_BUTTON_CLASS,
} from '@/shared/ui/patient/auth/loginChrome';
import {
  clearAuthFlowPending,
  readAuthFlowPending,
  saveRegisterVerifyPending,
  saveSpecialistSignupVerifyPending,
} from '@/shared/ui/patient/auth/authFlowPendingStorage';
import { getBrowserCalendarIanaForAuth } from '@/shared/lib/browserCalendarIana';
import {
  patientHeroBookingSectionClass,
  patientInnerPageStackClass,
  patientInlineLinkClass,
  patientMutedTextClass,
} from '@/shared/ui/patient/patientVisual';
import { SupportContactLink } from '@/shared/ui/patient/SupportContactLink';
import { PhoneMessengerAuthFlow } from '@/shared/ui/patient/auth/PhoneMessengerAuthFlow';
import {
  suggestOrganizationSlug,
  validateOrganizationSlugCandidate,
} from '@/modules/clinic-directory/organizationSlug';
import type { OrganizationSlugMutationErrorCode } from '@/modules/clinic-directory/ports';
import { staffSecurityErrorText } from '@/shared/ui/auth/staffSecurityErrorText';
import { PasswordAltchaChallenge } from '@/shared/ui/auth/PasswordAltchaChallenge';

const WEB_CHAT_ID_KEY = 'bersoncare_web_chat_id';

const SMS_DISABLED_WEB_MESSAGE =
  'SMS для входа с сайта отключён. Используйте код в Telegram, Max или на email.';
const AUTH_NETWORK_ERROR_MESSAGE = 'Нет связи с сервером. Проверьте интернет и повторите.';

function specialistSignupSlugErrorMessage(
  error: OrganizationSlugMutationErrorCode | 'invalid_body',
) {
  switch (error) {
    case 'slug_unavailable':
      return 'Этот адрес уже занят. Выберите другой.';
    case 'slug_invalid_characters':
      return 'Используйте только латинские буквы, цифры и дефисы.';
    case 'slug_too_short':
      return 'Адрес должен содержать минимум 3 символа.';
    case 'slug_too_long':
      return 'Адрес должен быть не длиннее 63 символов.';
    case 'reserved_slug':
      return 'Этот адрес зарезервирован системой. Выберите другой.';
    default:
      return 'Проверьте адрес публичной записи.';
  }
}

type FetchJsonResult<T> = { ok: true; response: Response; data: T } | { ok: false };

async function fetchJsonSafe<T>(url: string, init: RequestInit): Promise<FetchJsonResult<T>> {
  try {
    const response = await fetch(url, init);
    const data = (await response.json().catch(() => ({}))) as T;
    return { ok: true, response, data };
  } catch {
    return { ok: false };
  }
}

const authFlowShellClass = cn(
  patientHeroBookingSectionClass,
  patientInnerPageStackClass,
  'mx-auto w-full max-w-sm',
);

const authStepMutedParagraphClass = cn(patientMutedTextClass, 'text-balance');

const authLinkButtonClass = cn(
  'border-none bg-transparent',
  'h-auto min-h-0 px-0 py-0 text-sm',
  patientInlineLinkClass,
  'underline-offset-2',
  'font-medium',
  AUTH_LOGIN_ACCENT_TEXT_CLASS,
);

const authFormFieldLabelClass = cn(patientMutedTextClass, 'text-sm');
const authEmailInputClass = 'w-full bg-white';

function getWebChatId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem(WEB_CHAT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(WEB_CHAT_ID_KEY, id);
  }
  return id;
}

export type AuthFlowStep =
  | 'entry_loading'
  | 'oauth_first'
  | 'phone_login'
  | 'phone'
  | 'email_password'
  | 'new_user_foreign'
  | 'foreign_no_otp_channel'
  | 'choose_channel'
  | 'code';

type OtpChannel = 'sms' | 'telegram' | 'max' | 'email';

function hasPublicWebOtpChannel(methods: AuthMethodsPayload): boolean {
  return (
    isOtpChannelAvailablePublic(methods, 'telegram') ||
    isOtpChannelAvailablePublic(methods, 'max') ||
    isOtpChannelAvailablePublic(methods, 'email')
  );
}

function otpDescription(channel: OtpChannel, emailAddress?: string): string {
  switch (channel) {
    case 'telegram':
      return 'Введите код, отправленный вам в Telegram.';
    case 'max':
      return 'Введите код, отправленный вам в Max.';
    case 'email':
      return `Введите код, отправленный вам${emailAddress ? ` на ${emailAddress}` : ' на email'}.`;
    default:
      return 'Введите код, отправленный вам.';
  }
}

function buildAlternatives(
  methods: AuthMethodsPayload,
  currentChannel: OtpChannel,
  onChoose: (ch: OtpChannel) => Promise<OtpResendOutcome>,
): OtpAlternativeEntry[] {
  const result: OtpAlternativeEntry[] = [];
  for (const ch of OTP_PUBLIC_OTHER_CHANNELS_ORDER) {
    if (ch === currentChannel) continue;
    if (!isOtpChannelAvailablePublic(methods, ch)) continue;
    if (ch === 'telegram') {
      result.push({
        label: 'Получить код в Telegram',
        onClick: async () => {
          await onChoose('telegram');
        },
      });
      continue;
    }
    if (ch === 'max') {
      result.push({
        label: 'Получить код в Max',
        onClick: async () => {
          await onChoose('max');
        },
      });
      continue;
    }
    result.push({
      label: `Получить код на email${methods.emailAddress ? ` (${methods.emailAddress})` : ''}`,
      onClick: async () => {
        await onChoose('email');
      },
    });
  }
  return result;
}

function withContactSupportReturn(
  supportHref: string | undefined,
  fromParam: string,
): string | undefined {
  const raw = supportHref?.trim();
  if (!raw) return raw;
  if (!raw.includes('contact-support')) return raw;
  return raw.includes('?')
    ? `${raw}&from=${encodeURIComponent(fromParam)}`
    : `${raw}?from=${encodeURIComponent(fromParam)}`;
}

type OauthProviderFlags = { yandex: boolean; google: boolean; apple: boolean };

export type PrefetchedPublicAuthConfig = {
  oauthProviders: OauthProviderFlags;
  telegramBotUsername: string | null;
  maxBotOpenUrl: string | null;
  specialistSignupEnabled: boolean;
  authChannelPolicy?: AuthChannelUiPolicy;
  fetchedAt: number;
};

type AuthFlowV2Props = {
  nextParam: string | null;
  supportContactHref?: string;
  onStepChange?: (step: AuthFlowStep) => void;
  /** Сид из `AuthBootstrap` prefetch (публичные конфиги входа). */
  prefetchedAuthConfig?: PrefetchedPublicAuthConfig | null;
  /** Safe UI deep-link used by the dev-public helper; it does not create an authenticated role. */
  initialDevView?: 'registration';
  /** Пользователь начал интерактивный вход (OAuth / телефон / код) — не перехватывать UI поздним initData. */
  onInteractiveLoginEngaged?: () => void;
};

export function AuthFlowV2({
  nextParam,
  supportContactHref,
  onStepChange,
  prefetchedAuthConfig,
  initialDevView,
  onInteractiveLoginEngaged,
}: AuthFlowV2Props) {
  const router = useRouter();
  const engageInteractive = useCallback(() => {
    onInteractiveLoginEngaged?.();
  }, [onInteractiveLoginEngaged]);
  const [step, setStep] = useState<AuthFlowStep>('entry_loading');
  const pendingHydratedRef = useRef(false);
  const initialDevViewAppliedRef = useRef(false);
  const [oauthProviders, setOauthProviders] = useState<OauthProviderFlags>({
    yandex: false,
    google: false,
    apple: false,
  });
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [methods, setMethods] = useState<AuthMethodsPayload | null>(null);
  const [exists, setExists] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
  const [smsStartCooldownSec, setSmsStartCooldownSec] = useState(0);
  const [otpChannel, setOtpChannel] = useState<OtpChannel>('telegram');
  const [otpEntrySource, setOtpEntrySource] = useState<'registration' | 'channel' | 'auto' | null>(
    null,
  );
  const [emailLoginEmail, setEmailLoginEmail] = useState('');
  const [emailLoginPassword, setEmailLoginPassword] = useState('');
  const [passwordAltchaRequired, setPasswordAltchaRequired] = useState(false);
  const [passwordAltchaPayload, setPasswordAltchaPayload] = useState<string | null>(null);
  const [passwordAltchaGeneration, setPasswordAltchaGeneration] = useState(0);
  const [staffFactorCode, setStaffFactorCode] = useState('');
  const [staffFactorUseRecovery, setStaffFactorUseRecovery] = useState(false);
  const [emailRegPassword, setEmailRegPassword] = useState('');
  const [emailAuthMode, setEmailAuthMode] = useState<
    | 'login'
    | 'patient_registration'
    | 'verify'
    | 'specialist_signup'
    | 'password_login'
    | 'staff_factor'
  >('login');
  const [emailVerifyPurpose, setEmailVerifyPurpose] = useState<
    'registration' | 'patient_registration' | 'setup' | 'email_otp' | 'specialist_signup'
  >('registration');
  const [emailRegChallengeId, setEmailRegChallengeId] = useState<string | null>(null);
  const [emailRegAttemptId, setEmailRegAttemptId] = useState<string | null>(null);
  const [emailRegRetrySec, setEmailRegRetrySec] = useState(60);
  const [emailPasswordReturn, setEmailPasswordReturn] = useState<
    'oauth_first' | 'phone' | 'email_password'
  >('oauth_first');
  const [emailRegLastName, setEmailRegLastName] = useState('');
  const [emailRegFirstName, setEmailRegFirstName] = useState('');
  const [emailRegPatronymic, setEmailRegPatronymic] = useState('');
  const [specialistSignupLastName, setSpecialistSignupLastName] = useState('');
  const [specialistSignupFirstName, setSpecialistSignupFirstName] = useState('');
  const [specialistSignupPatronymic, setSpecialistSignupPatronymic] = useState('');
  const [specialistSignupOrganizationTitle, setSpecialistSignupOrganizationTitle] = useState('');
  const [specialistSignupOrganizationSlug, setSpecialistSignupOrganizationSlug] = useState('');
  const [specialistSignupSlugRecovery, setSpecialistSignupSlugRecovery] = useState(false);
  const [specialistSignupSlugStatus, setSpecialistSignupSlugStatus] = useState<
    'idle' | 'checking' | 'available' | 'error'
  >('idle');
  const [specialistSignupSlugMessage, setSpecialistSignupSlugMessage] = useState<string | null>(
    null,
  );
  const specialistSignupSlugEditedRef = useRef(false);
  const specialistSignupSlugCheckRef = useRef(0);
  const [specialistSignupPassword, setSpecialistSignupPassword] = useState('');
  const [pwRecoveryPhase, setPwRecoveryPhase] = useState<'none' | 'reset_code'>('none');
  const [pwRecoveryPurpose, setPwRecoveryPurpose] = useState<'reset' | 'setup'>('reset');
  const [pwResetEmail, setPwResetEmail] = useState('');
  const [pwResetChallengeId, setPwResetChallengeId] = useState<string | null>(null);
  const [pwResetCode, setPwResetCode] = useState('');
  const [pwNewPassword, setPwNewPassword] = useState('');
  const [emailSetupPromptEmail, setEmailSetupPromptEmail] = useState<string | null>(null);
  const specialistSignupEnabled = prefetchedAuthConfig?.specialistSignupEnabled === true;
  const authChannelPolicy =
    prefetchedAuthConfig?.authChannelPolicy ?? FAIL_CLOSED_AUTH_CHANNEL_UI_POLICY;
  const emailOtpEnabled = authChannelPolicy.email;
  const messengerPhoneEnabled = authChannelPolicy.telegram || authChannelPolicy.max;
  const phoneLoginEnabled =
    messengerPhoneEnabled || authChannelPolicy.sms || authChannelPolicy.email;

  useEffect(() => {
    if (smsStartCooldownSec <= 0) return;
    const t = window.setTimeout(() => setSmsStartCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [smsStartCooldownSec]);

  useEffect(() => {
    if (isMessengerMiniAppHost()) {
      setOauthProviders({ yandex: false, google: false, apple: false });
      if (messengerPhoneEnabled) {
        setStep('phone');
      } else {
        setEmailAuthMode('password_login');
        setStep('email_password');
      }
      return;
    }

    const oauth = prefetchedAuthConfig?.oauthProviders ?? {
      yandex: false,
      google: false,
      apple: false,
    };
    setOauthProviders(oauth);
    const oauthOn = oauth.yandex || oauth.google || oauth.apple;
    if (!emailOtpEnabled) setEmailAuthMode('password_login');
    setStep(oauthOn ? 'oauth_first' : 'email_password');
  }, [prefetchedAuthConfig, emailOtpEnabled, messengerPhoneEnabled]);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    if (initialDevViewAppliedRef.current || initialDevView !== 'registration') return;
    if (step === 'entry_loading' || isMessengerMiniAppHost()) return;
    initialDevViewAppliedRef.current = true;
    clearAuthFlowPending();
    engageInteractive();
    setStep('email_password');
    if (emailOtpEnabled && specialistSignupEnabled) {
      setEmailVerifyPurpose('specialist_signup');
      setEmailAuthMode('specialist_signup');
    } else {
      setEmailAuthMode('password_login');
    }
  }, [emailOtpEnabled, engageInteractive, initialDevView, specialistSignupEnabled, step]);

  useEffect(() => {
    if (pendingHydratedRef.current) return;
    if (typeof window === 'undefined') return;
    if (isMessengerMiniAppHost()) return;
    if (step !== 'oauth_first' && step !== 'email_password') return;
    pendingHydratedRef.current = true;
    const p = readAuthFlowPending();
    if (!p) return;
    if (!emailOtpEnabled && p.mode !== 'password_reset') {
      clearAuthFlowPending();
      setEmailAuthMode('password_login');
      return;
    }
    if (p.mode === 'register_verify') {
      engageInteractive();
      setStep('email_password');
      setEmailPasswordReturn(
        prefetchedAuthConfig?.oauthProviders?.yandex ||
          prefetchedAuthConfig?.oauthProviders?.google ||
          prefetchedAuthConfig?.oauthProviders?.apple
          ? 'oauth_first'
          : 'email_password',
      );
      setEmailLoginEmail(p.email);
      setEmailRegLastName(p.lastName ?? '');
      setEmailRegFirstName(p.firstName ?? '');
      setEmailRegPatronymic(p.patronymic ?? '');
      setEmailRegChallengeId(p.challengeId);
      setEmailRegAttemptId(p.attemptId ?? null);
      setEmailVerifyPurpose(
        p.purpose === 'patient_email_otp' ? 'patient_registration' : 'registration',
      );
      setEmailAuthMode('verify');
      setEmailRegRetrySec(p.retryAfterSeconds);
    } else if (p.mode === 'specialist_signup_verify') {
      if (!specialistSignupEnabled) {
        clearAuthFlowPending();
        return;
      }
      engageInteractive();
      setStep('email_password');
      setEmailPasswordReturn(
        prefetchedAuthConfig?.oauthProviders?.yandex ||
          prefetchedAuthConfig?.oauthProviders?.google ||
          prefetchedAuthConfig?.oauthProviders?.apple
          ? 'oauth_first'
          : 'email_password',
      );
      setEmailLoginEmail(p.email);
      setSpecialistSignupLastName(p.lastName ?? '');
      setSpecialistSignupFirstName(p.firstName ?? '');
      setSpecialistSignupPatronymic(p.patronymic ?? '');
      setSpecialistSignupOrganizationTitle(p.organizationTitle);
      setSpecialistSignupOrganizationSlug(p.organizationSlug);
      setSpecialistSignupSlugRecovery(!p.organizationSlug);
      setEmailRegChallengeId(p.challengeId);
      setEmailVerifyPurpose('specialist_signup');
      setEmailAuthMode('verify');
      setEmailRegRetrySec(p.retryAfterSeconds);
    } else if (p.mode === 'password_reset') {
      engageInteractive();
      setStep('email_password');
      setEmailPasswordReturn(
        prefetchedAuthConfig?.oauthProviders?.yandex ||
          prefetchedAuthConfig?.oauthProviders?.google ||
          prefetchedAuthConfig?.oauthProviders?.apple
          ? 'oauth_first'
          : 'email_password',
      );
      setEmailAuthMode('login');
      setPwRecoveryPhase('reset_code');
      setPwRecoveryPurpose('reset');
      setPwResetEmail(p.email);
      setPwResetChallengeId(p.challengeId ?? null);
    }
  }, [step, prefetchedAuthConfig, engageInteractive, specialistSignupEnabled, emailOtpEnabled]);

  const startOauth = async (provider: 'yandex' | 'google' | 'apple') => {
    engageInteractive();
    setLoading(true);
    try {
      const oauthResult = await fetchJsonSafe<{
        ok?: boolean;
        authUrl?: string;
        message?: string;
        error?: string;
      }>('/api/auth/oauth/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          browserCalendarIana: getBrowserCalendarIanaForAuth(),
        }),
      });
      if (!oauthResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { response: res, data } = oauthResult;
      if (data.ok && data.authUrl) {
        window.location.href = data.authUrl;
        return;
      }
      if (res.status === 429 || data.error === 'rate_limited') {
        toast.error(data.message ?? 'Слишком много попыток. Попробуйте позже.');
        return;
      }
      toast.error(data.message ?? 'Провайдер недоступен');
    } finally {
      setLoading(false);
    }
  };

  const showOauthRow = oauthProviders.yandex || oauthProviders.google;
  /** Apple в основном ряду только если нет Яндекса и Google — иначе основной набор провайдеров без Apple (продуктовое правило). */
  const showAppleFallback =
    oauthProviders.apple && !oauthProviders.yandex && !oauthProviders.google;
  const hasWebOauthAlternatives = showOauthRow || showAppleFallback;

  const resetEmailAuthFields = () => {
    setEmailAuthMode('login');
    setEmailVerifyPurpose('registration');
    setEmailRegChallengeId(null);
    setEmailRegRetrySec(60);
    setEmailRegPassword('');
    setEmailRegLastName('');
    setEmailRegFirstName('');
    setEmailRegPatronymic('');
    setEmailLoginEmail('');
    setEmailLoginPassword('');
    setSpecialistSignupLastName('');
    setSpecialistSignupFirstName('');
    setSpecialistSignupPatronymic('');
    setSpecialistSignupOrganizationTitle('');
    setSpecialistSignupPassword('');
    setPwRecoveryPhase('none');
    setPwRecoveryPurpose('reset');
    setPwResetEmail('');
    setPwResetChallengeId(null);
    setPwResetCode('');
    setPwNewPassword('');
    setEmailSetupPromptEmail(null);
  };

  const startEmailSetupCode = async (
    email: string,
  ): Promise<
    | { kind: 'ok'; challengeId: string; retryAfterSeconds: number }
    | { kind: 'rate_limited'; retryAfterSeconds: number }
    | { kind: 'failed'; message?: string }
    | { kind: 'network_error' }
  > => {
    const setupCodeResult = await fetchJsonSafe<{
      ok?: boolean;
      challengeId?: string;
      retryAfterSeconds?: number;
      error?: string;
      message?: string;
    }>('/api/auth/email-password/setup-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!setupCodeResult.ok) {
      return { kind: 'network_error' };
    }
    const { response: res, data } = setupCodeResult;
    if (data.ok && data.challengeId) {
      return {
        kind: 'ok',
        challengeId: data.challengeId,
        retryAfterSeconds: data.retryAfterSeconds ?? 60,
      };
    }
    if (res.status === 429 || data.error === 'rate_limited') {
      return {
        kind: 'rate_limited',
        retryAfterSeconds: Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60)),
      };
    }
    return { kind: 'failed', message: data.message };
  };

  const goBackToEntry = () => {
    setSmsStartCooldownSec(0);
    resetEmailAuthFields();
    pendingHydratedRef.current = false;
    clearAuthFlowPending();
    if (!isMessengerMiniAppHost()) {
      setStep(hasWebOauthAlternatives ? 'oauth_first' : 'email_password');
    } else {
      setStep('phone');
    }
    setPhone(null);
    setMethods(null);
  };

  const resetToOtherMethods = () => {
    pendingHydratedRef.current = false;
    clearAuthFlowPending();
    setSmsStartCooldownSec(0);
    resetEmailAuthFields();
    if (!isMessengerMiniAppHost()) {
      setStep(hasWebOauthAlternatives ? 'oauth_first' : 'email_password');
      setPhone(null);
      setMethods(null);
    } else {
      setStep('phone');
      setPhone(null);
      setMethods(null);
    }
  };

  const openEmailPasswordLogin = (returnTo: 'oauth_first' | 'phone' | 'email_password') => {
    engageInteractive();
    setEmailPasswordReturn(returnTo);
    resetEmailAuthFields();
    if (!emailOtpEnabled) setEmailAuthMode('password_login');
    setStep('email_password');
  };

  /** New passwordless email-OTP start handler. */
  const submitEmailOtpStart = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailOtpEnabled) return;
    engageInteractive();
    const email = emailLoginEmail.trim();
    if (!email) {
      toast.error('Введите email');
      return;
    }
    setLoading(true);
    try {
      const result = await fetchJsonSafe<{
        ok?: boolean;
        challengeId?: string;
        retryAfterSeconds?: number;
        error?: string;
        message?: string;
      }>('/api/auth/email-otp/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!result.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { data } = result;
      if (!data.ok) {
        toast.error(data.message ?? 'Не удалось отправить код');
        return;
      }
      setEmailRegChallengeId(data.challengeId ?? null);
      setEmailRegRetrySec(data.retryAfterSeconds ?? 60);
      setEmailVerifyPurpose('email_otp');
      setEmailAuthMode('verify');
    } finally {
      setLoading(false);
    }
  };

  const openPatientEmailRegistration = () => {
    if (!emailOtpEnabled) return;
    engageInteractive();
    clearAuthFlowPending();
    setEmailAuthMode('patient_registration');
    setEmailVerifyPurpose('patient_registration');
    setEmailRegChallengeId(null);
    setEmailRegLastName('');
    setEmailRegFirstName('');
    setEmailRegPatronymic('');
  };

  const submitPatientEmailRegistration = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailOtpEnabled) return;
    engageInteractive();
    const email = emailLoginEmail.trim();
    const lastName = emailRegLastName.trim();
    const firstName = emailRegFirstName.trim();
    const patronymic = emailRegPatronymic.trim();
    if (!email || !lastName || !firstName) {
      toast.error('Укажите email, фамилию и имя');
      return;
    }
    setLoading(true);
    try {
      const result = await fetchJsonSafe<{
        ok?: boolean;
        challengeId?: string;
        retryAfterSeconds?: number;
        error?: string;
        message?: string;
      }>('/api/auth/email-otp/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, lastName, firstName, patronymic: patronymic || undefined }),
      });
      if (!result.ok) return toast.error(AUTH_NETWORK_ERROR_MESSAGE);
      const { response, data } = result;
      if (data.ok && data.challengeId) {
        setEmailRegChallengeId(data.challengeId);
        setEmailRegRetrySec(data.retryAfterSeconds ?? 60);
        setEmailVerifyPurpose('patient_registration');
        setEmailAuthMode('verify');
        saveRegisterVerifyPending({
          email,
          challengeId: data.challengeId,
          retryAfterSeconds: data.retryAfterSeconds ?? 60,
          lastName,
          firstName,
          patronymic,
          purpose: 'patient_email_otp',
        });
        return;
      }
      if (response.status === 409 || data.error === 'duplicate_email') {
        toast.error('Аккаунт с этой почтой уже существует.');
        return;
      }
      toast.error(data.message ?? 'Не удалось начать регистрацию');
    } finally {
      setLoading(false);
    }
  };

  /** Staff/professional entry: switch the shared login screen to email+password. */
  const openPasswordLoginMode = () => {
    engageInteractive();
    clearAuthFlowPending();
    setEmailAuthMode('password_login');
    setEmailLoginPassword('');
    setPasswordAltchaRequired(false);
    setPasswordAltchaPayload(null);
  };

  /**
   * Forgot/set password entry point (email+password login screen).
   * `/forgot` is uniform-response by design (OWASP ASVS 2.5 / CWE-204: never discloses whether the
   * account exists) — it also transparently classifies a code-only account (owner's case: OTP login,
   * no `user_password_credentials` row) as `setupRequired`, so this one entry point covers both
   * "reset my forgotten password" and "set a password for the first time" without asking which one.
   */
  const submitForgotPassword = async () => {
    const email = emailLoginEmail.trim();
    if (!email) {
      toast.error('Введите email');
      return;
    }
    engageInteractive();
    setLoading(true);
    try {
      const result = await fetchJsonSafe<{
        ok?: boolean;
        challengeId?: string;
        retryAfterSeconds?: number;
        setupRequired?: boolean;
        error?: string;
      }>('/api/auth/email-password/forgot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!result.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { response: res, data } = result;
      if (res.status === 503 || data.error === 'auth_channel_disabled') {
        toast.error('Восстановление пароля по email временно недоступно.');
        return;
      }
      setEmailLoginPassword('');
      setPwResetEmail(email);
      setPwRecoveryPurpose(data.setupRequired ? 'setup' : 'reset');
      setPwResetChallengeId(data.challengeId ?? null);
      setPwResetCode('');
      setPwNewPassword('');
      setPwRecoveryPhase('reset_code');
      // Neutral wording on purpose: the endpoint never confirms or denies account existence.
      toast.success('Если аккаунт с этой почтой существует, мы отправили код.');
    } finally {
      setLoading(false);
    }
  };

  const openStaffFactorMode = () => {
    setEmailLoginPassword('');
    setStaffFactorCode('');
    setStaffFactorUseRecovery(false);
    setEmailAuthMode('staff_factor');
  };

  const submitEmailPasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    engageInteractive();
    const email = emailLoginEmail.trim();
    const password = emailLoginPassword;
    if (!email || !password) {
      toast.error('Введите email и пароль');
      return;
    }
    setLoading(true);
    try {
      const loginResult = await fetchJsonSafe<{
        ok?: boolean;
        redirectTo?: string;
        factorRequired?: boolean;
        error?: string;
        message?: string;
        captchaRequired?: boolean;
        captchaRefreshRequired?: boolean;
      }>('/api/auth/email-password/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(passwordAltchaPayload ? { altcha: passwordAltchaPayload } : {}),
        }),
      });
      if (!loginResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { response: res, data } = loginResult;
      if (data.ok && data.factorRequired) {
        openStaffFactorMode();
        return;
      }
      if (data.ok && data.redirectTo) {
        setEmailLoginPassword('');
        redirectOk(data.redirectTo);
        return;
      }
      if (res.status === 409 || data.error === 'email_not_verified') {
        toast.error('Email не подтверждён. Обратитесь в поддержку.');
        return;
      }
      if (data.error === 'invalid_credentials') {
        if (data.captchaRefreshRequired) {
          setPasswordAltchaRequired(true);
          setPasswordAltchaPayload(null);
          setPasswordAltchaGeneration((current) => current + 1);
        } else if (data.captchaRequired) {
          setPasswordAltchaRequired(true);
        }
        toast.error(
          data.message ?? 'Email или пароль неверны. Проверьте данные или восстановите пароль.',
        );
        return;
      }
      toast.error('Не удалось войти.');
    } finally {
      setLoading(false);
    }
  };

  const submitStaffFactor = async (e: FormEvent) => {
    e.preventDefault();
    const value = staffFactorCode.trim();
    if (!value) return toast.error('Введите код');
    setLoading(true);
    try {
      const result = await fetchJsonSafe<{ ok?: boolean; redirectTo?: string; error?: string }>(
        '/api/auth/email-password/login/factor',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(staffFactorUseRecovery ? { recoveryCode: value } : { code: value }),
        },
      );
      if (!result.ok) return toast.error(AUTH_NETWORK_ERROR_MESSAGE);
      if (result.data.ok && result.data.redirectTo) {
        setStaffFactorCode('');
        redirectOk(result.data.redirectTo, 'doctor');
        return;
      }
      toast.error(staffSecurityErrorText(result.data.error, 'login_factor'));
    } finally {
      setLoading(false);
    }
  };

  const openSpecialistSignup = () => {
    if (!specialistSignupEnabled) {
      toast.error('Регистрация кабинета специалиста пока недоступна.');
      return;
    }
    engageInteractive();
    clearAuthFlowPending();
    setEmailAuthMode('specialist_signup');
    setEmailVerifyPurpose('specialist_signup');
    setEmailRegChallengeId(null);
    setEmailRegRetrySec(60);
    setEmailLoginEmail('');
    setSpecialistSignupLastName('');
    setSpecialistSignupFirstName('');
    setSpecialistSignupPatronymic('');
    setSpecialistSignupOrganizationTitle('');
    setSpecialistSignupOrganizationSlug('');
    setSpecialistSignupSlugRecovery(false);
    setSpecialistSignupSlugStatus('idle');
    setSpecialistSignupSlugMessage(null);
    specialistSignupSlugEditedRef.current = false;
    specialistSignupSlugCheckRef.current += 1;
    setSpecialistSignupPassword('');
  };

  const checkSpecialistSignupSlugAvailability = async (): Promise<string | null> => {
    const checkId = ++specialistSignupSlugCheckRef.current;
    const validated = validateOrganizationSlugCandidate(specialistSignupOrganizationSlug);
    if (!validated.ok) {
      setSpecialistSignupSlugStatus('error');
      setSpecialistSignupSlugMessage(specialistSignupSlugErrorMessage(validated.code));
      return null;
    }

    setSpecialistSignupOrganizationSlug(validated.slug);
    setSpecialistSignupSlugStatus('checking');
    setSpecialistSignupSlugMessage('Проверяем адрес…');
    const result = await fetchJsonSafe<{
      ok?: boolean;
      slug?: string;
      available?: boolean;
      error?: OrganizationSlugMutationErrorCode | 'invalid_body';
    }>('/api/auth/specialist-signup/slug', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: validated.slug }),
    });
    if (checkId !== specialistSignupSlugCheckRef.current) return null;
    if (!result.ok) {
      setSpecialistSignupSlugStatus('error');
      setSpecialistSignupSlugMessage(AUTH_NETWORK_ERROR_MESSAGE);
      return null;
    }
    if (result.data.ok && result.data.available && result.data.slug) {
      setSpecialistSignupOrganizationSlug(result.data.slug);
      setSpecialistSignupSlugStatus('available');
      setSpecialistSignupSlugMessage('Адрес свободен.');
      return result.data.slug;
    }
    setSpecialistSignupSlugStatus('error');
    setSpecialistSignupSlugMessage(
      specialistSignupSlugErrorMessage(result.data.error ?? 'invalid_body'),
    );
    return null;
  };

  const submitSpecialistSignupStart = async (e: FormEvent) => {
    e.preventDefault();
    engageInteractive();
    const email = emailLoginEmail.trim();
    const password = specialistSignupPassword;
    const lastName = specialistSignupLastName.trim();
    const firstName = specialistSignupFirstName.trim();
    const patronymic = specialistSignupPatronymic.trim();
    const organizationTitle = specialistSignupOrganizationTitle.trim();
    if (
      !email ||
      !password ||
      !lastName ||
      !firstName ||
      !organizationTitle ||
      !specialistSignupOrganizationSlug.trim()
    ) {
      toast.error('Заполните все поля');
      return;
    }
    if (password.length < 8) {
      toast.error('Пароль — не менее 8 символов.');
      return;
    }
    const organizationSlug = await checkSpecialistSignupSlugAvailability();
    if (!organizationSlug) return;
    setLoading(true);
    try {
      const result = await fetchJsonSafe<{
        ok?: boolean;
        challengeId?: string;
        retryAfterSeconds?: number;
        error?: string;
        message?: string;
      }>('/api/auth/specialist-signup/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          lastName,
          firstName,
          patronymic: patronymic || undefined,
          organizationTitle,
          organizationSlug,
        }),
      });
      if (!result.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { response: res, data } = result;
      if (data.ok && data.challengeId) {
        setSpecialistSignupSlugRecovery(false);
        setEmailRegChallengeId(data.challengeId);
        setEmailRegRetrySec(data.retryAfterSeconds ?? 60);
        setEmailVerifyPurpose('specialist_signup');
        setEmailAuthMode('verify');
        saveSpecialistSignupVerifyPending({
          email,
          challengeId: data.challengeId,
          retryAfterSeconds: data.retryAfterSeconds ?? 60,
          lastName,
          firstName,
          patronymic,
          organizationTitle,
          organizationSlug,
        });
        return;
      }
      if (data.error === 'slug_unavailable') {
        setSpecialistSignupSlugStatus('error');
        setSpecialistSignupSlugMessage(specialistSignupSlugErrorMessage('slug_unavailable'));
        return;
      }
      if (data.error === 'duplicate_email') {
        toast.error('Аккаунт с этой почтой уже существует.');
        return;
      }
      if (data.error?.startsWith('slug_') || data.error === 'reserved_slug') {
        setSpecialistSignupSlugStatus('error');
        setSpecialistSignupSlugMessage(
          specialistSignupSlugErrorMessage(data.error as OrganizationSlugMutationErrorCode),
        );
        return;
      }
      if (res.status === 429 || data.error === 'rate_limited') {
        toast.error(data.message ?? 'Слишком много попыток. Попробуйте позже.');
        return;
      }
      toast.error(data.message ?? 'Не удалось начать регистрацию');
    } finally {
      setLoading(false);
    }
  };

  const redirectOk = (redirectTo: string, role?: 'client' | 'doctor' | 'admin') => {
    clearAuthFlowPending();
    markFreshLoginAfterAuth();
    const target = getPostAuthRedirectTarget(role ?? 'client', nextParam, redirectTo);
    router.replace(target);
  };

  const submitEmailSetupAccessResend = async () => {
    const email = emailSetupPromptEmail?.trim();
    if (!email) return;
    engageInteractive();
    setLoading(true);
    try {
      const result = await startEmailSetupCode(email);
      if (result.kind === 'network_error') {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      if (result.kind === 'ok') {
        setEmailSetupPromptEmail(null);
        setEmailRegChallengeId(result.challengeId);
        setEmailRegAttemptId(null);
        setEmailRegRetrySec(result.retryAfterSeconds);
        setEmailVerifyPurpose('setup');
        setEmailAuthMode('verify');
        toast.success('Отправили код на почту.');
        return;
      }
      if (result.kind === 'rate_limited') {
        setEmailRegRetrySec(result.retryAfterSeconds);
        toast.error('Код уже отправлен. Проверьте почту.');
        return;
      }
      toast.error('Не удалось отправить письмо');
    } finally {
      setLoading(false);
    }
  };

  const submitPasswordResetFinalize = async (e: FormEvent) => {
    e.preventDefault();
    engageInteractive();
    const email = pwResetEmail.trim();
    if (!email || !pwResetCode.trim() || pwNewPassword.length < 8) {
      toast.error('Введите код и новый пароль (не менее 8 символов)');
      return;
    }
    setLoading(true);
    try {
      const endpoint =
        pwRecoveryPurpose === 'setup'
          ? '/api/auth/email-password/setup-code/complete'
          : '/api/auth/email-password/reset';
      const resetResult = await fetchJsonSafe<{
        ok?: boolean;
        redirectTo?: string;
        role?: 'client' | 'doctor' | 'admin';
        error?: string;
        message?: string;
        retryAfterSeconds?: number;
      }>(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          pwRecoveryPurpose === 'setup'
            ? {
                email,
                challengeId: pwResetChallengeId,
                code: pwResetCode.trim(),
                password: pwNewPassword,
              }
            : { email, code: pwResetCode.trim(), newPassword: pwNewPassword },
        ),
      });
      if (!resetResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { response: res, data } = resetResult;
      if (data.ok && data.redirectTo) {
        redirectOk(data.redirectTo, data.role);
        return;
      }
      if (data.ok) {
        clearAuthFlowPending();
        setPwRecoveryPhase('none');
        setPwRecoveryPurpose('reset');
        setPwResetChallengeId(null);
        setPwResetCode('');
        setPwNewPassword('');
        toast.success(
          pwRecoveryPurpose === 'setup' ? 'Доступ настроен.' : 'Пароль обновлён. Войдите.',
        );
        setEmailLoginEmail(email);
        setEmailAuthMode('login');
        return;
      }
      if (res.status === 429 || data.error === 'too_many_attempts') {
        toast.error(data.message ?? 'Слишком частые попытки');
        return;
      }
      if (data.error === 'expired_code') {
        toast.error('Код истёк. Запросите новый.');
        return;
      }
      toast.error(data.message ?? 'Неверный или просроченный код');
    } finally {
      setLoading(false);
    }
  };

  const startPhoneOtp = async (
    deliveryChannel: OtpChannel,
    entry: 'registration' | 'channel' | 'auto',
    phoneForRequest?: string | null,
  ): Promise<OtpResendOutcome> => {
    const effectivePhone = phoneForRequest ?? phone;
    if (!effectivePhone) return { kind: 'error', message: 'Нет номера телефона' };
    if (deliveryChannel === 'sms') {
      toast.error(SMS_DISABLED_WEB_MESSAGE);
      return { kind: 'error', message: SMS_DISABLED_WEB_MESSAGE };
    }
    engageInteractive();
    setLoading(true);
    try {
      const chatId = getWebChatId();
      const startOtpResult = await fetchJsonSafe<{
        ok?: boolean;
        challengeId?: string;
        retryAfterSeconds?: number;
        message?: string;
        error?: string;
      }>('/api/auth/phone/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: effectivePhone, channel: 'web', chatId, deliveryChannel }),
      });
      if (!startOtpResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return { kind: 'error', message: AUTH_NETWORK_ERROR_MESSAGE };
      }
      const { response: res, data } = startOtpResult;
      if (!res.ok || !data.ok || !data.challengeId) {
        if (res.status === 429 || data.error === 'rate_limited') {
          const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
          setSmsStartCooldownSec(sec);
          return { kind: 'rate_limited', retryAfterSeconds: sec };
        }
        const message = data.message ?? 'Не удалось отправить код';
        toast.error(message);
        return { kind: 'error', message };
      }
      setSmsStartCooldownSec(0);
      setChallengeId(data.challengeId);
      setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
      setOtpChannel(deliveryChannel);
      setOtpEntrySource(entry);
      setStep('code');
      return { kind: 'ok' };
    } finally {
      setLoading(false);
    }
  };

  const runCheckPhone = async (normalized: string) => {
    engageInteractive();
    setLoading(true);
    try {
      const checkPhoneResult = await fetchJsonSafe<{
        ok?: boolean;
        exists?: boolean;
        methods?: AuthMethodsPayload;
        preferredOtpChannel?: OtpChannel | null;
      }>('/api/auth/check-phone', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      });
      if (!checkPhoneResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { response: res, data } = checkPhoneResult;
      if (!res.ok || !data.ok || !data.methods) {
        toast.error('Не удалось проверить номер');
        return;
      }
      setPhone(normalized);
      setExists(Boolean(data.exists));
      const allowedMethods = filterAuthMethodsByChannelPolicy(data.methods, authChannelPolicy);
      setMethods(allowedMethods);
      if (!data.exists) {
        setStep(hasPublicWebOtpChannel(allowedMethods) ? 'choose_channel' : 'new_user_foreign');
      } else {
        const primary = pickOtpChannelWithPreferencePublic(
          allowedMethods,
          data.preferredOtpChannel,
        );
        const hasPublicChannel = hasPublicWebOtpChannel(allowedMethods);
        if (primary == null) {
          setStep(hasPublicChannel ? 'choose_channel' : 'foreign_no_otp_channel');
        } else {
          const outcome = await startPhoneOtp(primary, 'auto', normalized);
          if (outcome.kind !== 'ok') {
            setStep('choose_channel');
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (step === 'entry_loading') {
    return (
      <div
        id="auth-flow-v2-entry-loading"
        className={cn(authFlowShellClass, patientMutedTextClass, 'text-center')}
      >
        Загрузка…
      </div>
    );
  }

  if (step === 'email_password') {
    const showEmailChromeBack =
      emailSetupPromptEmail != null ||
      pwRecoveryPhase !== 'none' ||
      emailAuthMode === 'verify' ||
      emailPasswordReturn === 'oauth_first' ||
      emailPasswordReturn === 'phone';

    const topBackLabel =
      emailSetupPromptEmail != null
        ? 'Назад'
        : pwRecoveryPhase !== 'none'
          ? 'Назад'
          : emailAuthMode === 'verify'
            ? 'Войти другим способом'
            : emailPasswordReturn === 'oauth_first'
              ? 'К выбору входа'
              : 'Назад';

    return (
      <div id="auth-flow-v2-email-password" className={cn(authFlowShellClass, 'w-full text-left')}>
        {showEmailChromeBack ? (
          <Button
            type="button"
            variant="link"
            className={authLinkButtonClass}
            disabled={loading}
            onClick={() => {
              if (emailSetupPromptEmail != null) {
                setEmailSetupPromptEmail(null);
                return;
              }
              if (pwRecoveryPhase !== 'none') {
                setPwRecoveryPhase('none');
                setPwRecoveryPurpose('reset');
                setPwResetCode('');
                setPwNewPassword('');
                setPwResetEmail('');
                setPwResetChallengeId(null);
                return;
              }
              if (emailAuthMode === 'verify') {
                resetToOtherMethods();
                return;
              }
              resetEmailAuthFields();
              setStep(emailPasswordReturn);
            }}
          >
            {topBackLabel}
          </Button>
        ) : null}

        {emailSetupPromptEmail ? (
          <div className="mt-3 flex w-full flex-col gap-3">
            <p className={patientMutedTextClass}>
              Аккаунт с этой почтой уже есть. Подтвердите email и задайте пароль для входа.
            </p>
            <p className={cn(patientMutedTextClass, 'break-all text-sm')}>
              {emailSetupPromptEmail}
            </p>
            <Button
              type="button"
              variant="outline"
              className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void submitEmailSetupAccessResend()}
            >
              Отправить код
            </Button>
          </div>
        ) : pwRecoveryPhase === 'reset_code' ? (
          <form
            className="mt-3 flex w-full flex-col gap-3"
            onSubmit={(e) => void submitPasswordResetFinalize(e)}
          >
            <p className={patientMutedTextClass}>Код отправлен на {pwResetEmail.trim()}</p>
            <div className="flex flex-col gap-1">
              <label htmlFor="auth-pw-reset-code" className={authFormFieldLabelClass}>
                Код из письма
              </label>
              <Input
                id="auth-pw-reset-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={pwResetCode}
                onChange={(e) => setPwResetCode(e.target.value.replace(/\D/g, ''))}
                disabled={loading}
                className={authEmailInputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="auth-pw-reset-new" className={authFormFieldLabelClass}>
                Новый пароль
              </label>
              <Input
                id="auth-pw-reset-new"
                type="password"
                autoComplete="new-password"
                value={pwNewPassword}
                onChange={(e) => setPwNewPassword(e.target.value)}
                disabled={loading}
                className={authEmailInputClass}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
              disabled={loading}
            >
              Сохранить пароль
            </Button>
          </form>
        ) : (
          <>
            {emailAuthMode === 'login' ? (
              <form
                className="mt-3 flex w-full flex-col gap-3"
                onSubmit={(e) => void submitEmailOtpStart(e)}
              >
                <p className={authStepMutedParagraphClass}>Отправим 6-значный код на вашу почту.</p>
                <div className="flex flex-col gap-1">
                  <label htmlFor="auth-email-otp-input" className={authFormFieldLabelClass}>
                    Email
                  </label>
                  <Input
                    id="auth-email-otp-input"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    value={emailLoginEmail}
                    onChange={(e) => setEmailLoginEmail(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
                  disabled={loading}
                >
                  Получить код
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className={authLinkButtonClass}
                  disabled={loading}
                  onClick={openPatientEmailRegistration}
                >
                  Зарегистрироваться
                </Button>
                {emailOtpEnabled && specialistSignupEnabled ? (
                  <Button
                    type="button"
                    variant="link"
                    className={authLinkButtonClass}
                    disabled={loading}
                    onClick={openSpecialistSignup}
                  >
                    Я специалист
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="link"
                  className={authLinkButtonClass}
                  disabled={loading}
                  onClick={openPasswordLoginMode}
                >
                  Войти по паролю
                </Button>
              </form>
            ) : null}

            {emailAuthMode === 'patient_registration' ? (
              <form
                className="mt-3 flex w-full flex-col gap-3"
                onSubmit={(e) => void submitPatientEmailRegistration(e)}
              >
                <div className="flex flex-col gap-1">
                  <label htmlFor="auth-patient-register-email" className={authFormFieldLabelClass}>
                    Email
                  </label>
                  <Input
                    id="auth-patient-register-email"
                    type="email"
                    autoComplete="email"
                    value={emailLoginEmail}
                    onChange={(e) => setEmailLoginEmail(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="auth-patient-register-last-name"
                    className={authFormFieldLabelClass}
                  >
                    Фамилия
                  </label>
                  <Input
                    id="auth-patient-register-last-name"
                    type="text"
                    autoComplete="family-name"
                    value={emailRegLastName}
                    onChange={(e) => setEmailRegLastName(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="auth-patient-register-first-name"
                    className={authFormFieldLabelClass}
                  >
                    Имя
                  </label>
                  <Input
                    id="auth-patient-register-first-name"
                    type="text"
                    autoComplete="given-name"
                    value={emailRegFirstName}
                    onChange={(e) => setEmailRegFirstName(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="auth-patient-register-patronymic"
                    className={authFormFieldLabelClass}
                  >
                    Отчество
                  </label>
                  <Input
                    id="auth-patient-register-patronymic"
                    type="text"
                    autoComplete="additional-name"
                    value={emailRegPatronymic}
                    onChange={(e) => setEmailRegPatronymic(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
                  disabled={loading}
                >
                  Зарегистрироваться
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className={authLinkButtonClass}
                  disabled={loading}
                  onClick={() => setEmailAuthMode('login')}
                >
                  Войти по коду
                </Button>
              </form>
            ) : null}

            {emailAuthMode === 'password_login' ? (
              <form
                className="mt-3 flex w-full flex-col gap-3"
                onSubmit={(e) => void submitEmailPasswordLogin(e)}
              >
                <p className={authStepMutedParagraphClass}>
                  Вход по email и паролю (для сотрудников клиники).
                </p>
                <div className="flex flex-col gap-1">
                  <label htmlFor="auth-password-login-email" className={authFormFieldLabelClass}>
                    Email
                  </label>
                  <Input
                    id="auth-password-login-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    value={emailLoginEmail}
                    onChange={(e) => {
                      setEmailLoginEmail(e.target.value);
                      setPasswordAltchaRequired(false);
                      setPasswordAltchaPayload(null);
                    }}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="auth-password-login-password" className={authFormFieldLabelClass}>
                    Пароль
                  </label>
                  <Input
                    id="auth-password-login-password"
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={emailLoginPassword}
                    onChange={(e) => setEmailLoginPassword(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                {passwordAltchaRequired ? (
                  <PasswordAltchaChallenge
                    key={passwordAltchaGeneration}
                    endpoint="/api/auth/email-password/login/challenge"
                    email={emailLoginEmail.trim()}
                    onVerified={setPasswordAltchaPayload}
                  />
                ) : null}
                <Button
                  type="submit"
                  variant="outline"
                  className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
                  disabled={loading || (passwordAltchaRequired && !passwordAltchaPayload)}
                >
                  Войти
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className={authLinkButtonClass}
                  disabled={loading}
                  onClick={() => void submitForgotPassword()}
                >
                  Забыли пароль?
                </Button>
                {emailOtpEnabled ? (
                  <Button
                    type="button"
                    variant="link"
                    className={authLinkButtonClass}
                    disabled={loading}
                    onClick={() => {
                      setEmailAuthMode('login');
                      setEmailLoginPassword('');
                      setPasswordAltchaRequired(false);
                      setPasswordAltchaPayload(null);
                    }}
                  >
                    Войти по коду
                  </Button>
                ) : null}
              </form>
            ) : null}

            {phoneLoginEnabled &&
            (emailAuthMode === 'login' || emailAuthMode === 'password_login') ? (
              <Button
                type="button"
                variant="link"
                className={authLinkButtonClass}
                disabled={loading}
                onClick={() => setStep('phone_login')}
              >
                Войти по номеру телефона
              </Button>
            ) : null}

            {emailAuthMode === 'staff_factor' ? (
              <form
                className="mt-3 flex w-full flex-col gap-3"
                onSubmit={(e) => void submitStaffFactor(e)}
              >
                <p className={authStepMutedParagraphClass}>
                  {staffFactorUseRecovery
                    ? 'Введите один из сохранённых резервных кодов.'
                    : 'Введите код из приложения-аутентификатора.'}
                </p>
                <div className="flex flex-col gap-1">
                  <label htmlFor="auth-staff-factor-code" className={authFormFieldLabelClass}>
                    Код
                  </label>
                  <Input
                    id="auth-staff-factor-code"
                    type="text"
                    inputMode={staffFactorUseRecovery ? 'text' : 'numeric'}
                    autoComplete="one-time-code"
                    value={staffFactorCode}
                    onChange={(e) => setStaffFactorCode(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
                  disabled={loading}
                >
                  Продолжить
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className={authLinkButtonClass}
                  disabled={loading}
                  onClick={() => {
                    setStaffFactorUseRecovery((current) => !current);
                    setStaffFactorCode('');
                  }}
                >
                  {staffFactorUseRecovery
                    ? 'Использовать приложение'
                    : 'Использовать резервный код'}
                </Button>
                {supportContactHref ? (
                  <SupportContactLink
                    href={
                      withContactSupportReturn(supportContactHref, 'staff-factor') ??
                      supportContactHref
                    }
                    className={authLinkButtonClass}
                  >
                    Нет доступа к приложению и резервным кодам
                  </SupportContactLink>
                ) : null}
              </form>
            ) : null}

            {emailAuthMode === 'specialist_signup' ? (
              <form
                className="mt-3 flex w-full flex-col gap-3"
                onSubmit={(e) => void submitSpecialistSignupStart(e)}
              >
                <p className={authStepMutedParagraphClass}>
                  Создадим кабинет специалиста и отправим код на почту.
                </p>
                <div className="flex flex-col gap-1">
                  <label htmlFor="auth-specialist-email" className={authFormFieldLabelClass}>
                    Email
                  </label>
                  <Input
                    id="auth-specialist-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    value={emailLoginEmail}
                    onChange={(e) => setEmailLoginEmail(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="auth-specialist-password" className={authFormFieldLabelClass}>
                    Пароль
                  </label>
                  <Input
                    id="auth-specialist-password"
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    value={specialistSignupPassword}
                    onChange={(e) => setSpecialistSignupPassword(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="auth-specialist-last-name" className={authFormFieldLabelClass}>
                    Фамилия
                  </label>
                  <Input
                    id="auth-specialist-last-name"
                    type="text"
                    name="lastName"
                    autoComplete="family-name"
                    value={specialistSignupLastName}
                    onChange={(e) => setSpecialistSignupLastName(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="auth-specialist-first-name" className={authFormFieldLabelClass}>
                    Имя
                  </label>
                  <Input
                    id="auth-specialist-first-name"
                    type="text"
                    name="firstName"
                    autoComplete="given-name"
                    value={specialistSignupFirstName}
                    onChange={(e) => setSpecialistSignupFirstName(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="auth-specialist-patronymic" className={authFormFieldLabelClass}>
                    Отчество
                  </label>
                  <Input
                    id="auth-specialist-patronymic"
                    type="text"
                    name="patronymic"
                    autoComplete="additional-name"
                    value={specialistSignupPatronymic}
                    onChange={(e) => setSpecialistSignupPatronymic(e.target.value)}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="auth-specialist-organization" className={authFormFieldLabelClass}>
                    Название организации
                  </label>
                  <Input
                    id="auth-specialist-organization"
                    type="text"
                    name="organizationTitle"
                    autoComplete="organization"
                    value={specialistSignupOrganizationTitle}
                    onChange={(e) => {
                      const title = e.target.value;
                      setSpecialistSignupOrganizationTitle(title);
                      if (!specialistSignupSlugEditedRef.current) {
                        specialistSignupSlugCheckRef.current += 1;
                        setSpecialistSignupOrganizationSlug(suggestOrganizationSlug(title) ?? '');
                        setSpecialistSignupSlugStatus('idle');
                        setSpecialistSignupSlugMessage(null);
                      }
                    }}
                    disabled={loading}
                    className={authEmailInputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="auth-specialist-organization-slug"
                    className={authFormFieldLabelClass}
                  >
                    Публичный адрес
                  </label>
                  <Input
                    id="auth-specialist-organization-slug"
                    type="text"
                    name="organizationSlug"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={specialistSignupOrganizationSlug}
                    onChange={(e) => {
                      specialistSignupSlugEditedRef.current = true;
                      specialistSignupSlugCheckRef.current += 1;
                      const value = e.target.value.toLowerCase();
                      setSpecialistSignupOrganizationSlug(value);
                      const validated = validateOrganizationSlugCandidate(value);
                      setSpecialistSignupSlugStatus(validated.ok ? 'idle' : 'error');
                      setSpecialistSignupSlugMessage(
                        validated.ok ? null : specialistSignupSlugErrorMessage(validated.code),
                      );
                    }}
                    onBlur={() => void checkSpecialistSignupSlugAvailability()}
                    disabled={loading}
                    aria-invalid={specialistSignupSlugStatus === 'error'}
                    className={authEmailInputClass}
                  />
                  <span className={cn(patientMutedTextClass, 'text-xs')}>
                    /book/{specialistSignupOrganizationSlug || 'adres-kliniki'}
                  </span>
                  {specialistSignupSlugMessage ? (
                    <span
                      role={specialistSignupSlugStatus === 'error' ? 'alert' : 'status'}
                      className={cn(
                        'text-xs',
                        specialistSignupSlugStatus === 'error'
                          ? 'text-destructive'
                          : patientMutedTextClass,
                      )}
                    >
                      {specialistSignupSlugMessage}
                    </span>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
                  disabled={loading}
                >
                  Создать кабинет
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className={authLinkButtonClass}
                  disabled={loading}
                  onClick={() => {
                    clearAuthFlowPending();
                    setEmailAuthMode('login');
                    setEmailVerifyPurpose('registration');
                    setEmailRegChallengeId(null);
                    setEmailRegRetrySec(60);
                  }}
                >
                  Войти как пациент
                </Button>
              </form>
            ) : null}

            {emailAuthMode === 'verify' && emailRegChallengeId ? (
              <div className="mt-2">
                {emailVerifyPurpose === 'specialist_signup' && specialistSignupSlugRecovery ? (
                  <div className="mb-3 flex flex-col gap-1">
                    <label
                      htmlFor="auth-specialist-recovery-slug"
                      className={authFormFieldLabelClass}
                    >
                      Публичный адрес
                    </label>
                    <Input
                      id="auth-specialist-recovery-slug"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={specialistSignupOrganizationSlug}
                      onChange={(e) => {
                        specialistSignupSlugEditedRef.current = true;
                        specialistSignupSlugCheckRef.current += 1;
                        const value = e.target.value.toLowerCase();
                        setSpecialistSignupOrganizationSlug(value);
                        const validated = validateOrganizationSlugCandidate(value);
                        setSpecialistSignupSlugStatus(validated.ok ? 'idle' : 'error');
                        setSpecialistSignupSlugMessage(
                          validated.ok ? null : specialistSignupSlugErrorMessage(validated.code),
                        );
                      }}
                      onBlur={() => void checkSpecialistSignupSlugAvailability()}
                      disabled={loading}
                      aria-invalid={specialistSignupSlugStatus === 'error'}
                      className={authEmailInputClass}
                    />
                    <span className={cn(patientMutedTextClass, 'text-xs')}>
                      /book/{specialistSignupOrganizationSlug || 'adres-kliniki'}
                    </span>
                    {specialistSignupSlugMessage ? (
                      <span
                        role={specialistSignupSlugStatus === 'error' ? 'alert' : 'status'}
                        className={cn(
                          'text-xs',
                          specialistSignupSlugStatus === 'error'
                            ? 'text-destructive'
                            : patientMutedTextClass,
                        )}
                      >
                        {specialistSignupSlugMessage}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <OtpCodeForm
                  challengeId={emailRegChallengeId}
                  retryAfterSeconds={emailRegRetrySec}
                  supportContactHref={withContactSupportReturn(supportContactHref, 'verify')}
                  submitLabel="Продолжить"
                  description={
                    emailVerifyPurpose === 'specialist_signup'
                      ? specialistSignupSlugRecovery
                        ? 'Укажите публичный адрес и введите код из письма.'
                        : 'Введите код из письма, чтобы завершить регистрацию кабинета.'
                      : 'Введите код из письма.'
                  }
                  onConfirm={async (code) => {
                    engageInteractive();
                    if (emailVerifyPurpose === 'specialist_signup') {
                      let organizationSlug: string | undefined;
                      if (specialistSignupSlugRecovery) {
                        organizationSlug =
                          (await checkSpecialistSignupSlugAvailability()) ?? undefined;
                        if (!organizationSlug) {
                          return {
                            ok: false as const,
                            message: 'Укажите свободный публичный адрес.',
                          };
                        }
                      }
                      const r = await fetchJsonSafe<{
                        ok?: boolean;
                        redirectTo?: string;
                        error?: string;
                        message?: string;
                        retryAfterSeconds?: number;
                      }>('/api/auth/specialist-signup/confirm', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                          challengeId: emailRegChallengeId,
                          code,
                          ...(organizationSlug ? { organizationSlug } : {}),
                        }),
                      });
                      if (!r.ok) return { ok: false as const, message: AUTH_NETWORK_ERROR_MESSAGE };
                      const { response: res, data } = r;
                      if (data.ok && data.redirectTo) {
                        redirectOk(data.redirectTo, 'doctor');
                        return { ok: true as const, redirectTo: data.redirectTo };
                      }
                      if (data.error === 'provisioning_pending' && data.redirectTo) {
                        redirectOk(data.redirectTo, 'doctor');
                        return { ok: true as const, redirectTo: data.redirectTo };
                      }
                      if (data.error === 'security_setup_pending') {
                        setEmailRegChallengeId(null);
                        setEmailVerifyPurpose('registration');
                        setEmailAuthMode('login');
                        toast.error(
                          data.message ??
                            'Войдите с паролем ещё раз, чтобы продолжить защищённую настройку.',
                        );
                        return { ok: false as const, message: data.message ?? 'Повторите вход.' };
                      }
                      if (data.error === 'organization_slug_required') {
                        setSpecialistSignupSlugRecovery(true);
                        return {
                          ok: false as const,
                          message:
                            data.message ??
                            'Выберите публичный адрес клиники и повторите подтверждение.',
                        };
                      }
                      if (data.error === 'slug_unavailable') {
                        setSpecialistSignupSlugRecovery(true);
                        setSpecialistSignupSlugStatus('error');
                        setSpecialistSignupSlugMessage(
                          specialistSignupSlugErrorMessage('slug_unavailable'),
                        );
                        return {
                          ok: false as const,
                          message: specialistSignupSlugErrorMessage('slug_unavailable'),
                        };
                      }
                      if (res.status === 429 || data.error === 'too_many_attempts') {
                        return {
                          ok: false as const,
                          message: data.message ?? '',
                          code: 'too_many_attempts',
                          retryAfterSeconds: data.retryAfterSeconds,
                        };
                      }
                      if (res.status === 423 || data.error === 'specialist_signup_disabled') {
                        return {
                          ok: false as const,
                          message: 'Регистрация кабинета специалиста пока недоступна.',
                        };
                      }
                      if (data.error === 'invalid_code') {
                        return { ok: false as const, message: 'Неверный код' };
                      }
                      return {
                        ok: false as const,
                        message: data.message ?? 'Не удалось подтвердить код',
                      };
                    }
                    if (
                      emailVerifyPurpose === 'email_otp' ||
                      emailVerifyPurpose === 'patient_registration'
                    ) {
                      // Passwordless email-OTP confirm
                      const r = await fetchJsonSafe<{
                        ok?: boolean;
                        redirectTo?: string;
                        role?: 'client' | 'doctor' | 'admin';
                        error?: string;
                        message?: string;
                        retryAfterSeconds?: number;
                      }>('/api/auth/email-otp/confirm', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ email: emailLoginEmail.trim(), code }),
                      });
                      if (!r.ok) return { ok: false as const, message: AUTH_NETWORK_ERROR_MESSAGE };
                      const { response: res, data } = r;
                      if (data.ok && data.redirectTo) {
                        redirectOk(data.redirectTo, data.role);
                        return { ok: true as const, redirectTo: data.redirectTo };
                      }
                      if (res.status === 429 || data.error === 'too_many_attempts') {
                        return {
                          ok: false as const,
                          message: data.message ?? '',
                          code: 'too_many_attempts',
                          retryAfterSeconds: data.retryAfterSeconds,
                        };
                      }
                      return { ok: false as const, message: data.message ?? 'Неверный код' };
                    }
                    if (emailVerifyPurpose === 'setup' && emailRegPassword.length < 8) {
                      return { ok: false as const, message: 'Пароль — не менее 8 символов.' };
                    }
                    const confirmEmailResult = await fetchJsonSafe<{
                      ok?: boolean;
                      redirectTo?: string;
                      role?: 'client' | 'doctor' | 'admin';
                      error?: string;
                      message?: string;
                      retryAfterSeconds?: number;
                    }>(
                      emailVerifyPurpose === 'setup'
                        ? '/api/auth/email-password/setup-code/complete'
                        : '/api/auth/email-password/register/confirm',
                      {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify(
                          emailVerifyPurpose === 'setup'
                            ? {
                                email: emailLoginEmail.trim(),
                                challengeId: emailRegChallengeId,
                                code,
                                password: emailRegPassword,
                              }
                            : {
                                challengeId: emailRegChallengeId,
                                code,
                                ...(emailRegAttemptId ? { attemptId: emailRegAttemptId } : {}),
                              },
                        ),
                      },
                    );
                    if (!confirmEmailResult.ok) {
                      return { ok: false as const, message: AUTH_NETWORK_ERROR_MESSAGE };
                    }
                    const { response: res, data } = confirmEmailResult;
                    if (data.ok && data.redirectTo) {
                      redirectOk(data.redirectTo, data.role);
                      return { ok: true as const, redirectTo: data.redirectTo };
                    }
                    if (res.status === 429 || data.error === 'too_many_attempts') {
                      return {
                        ok: false as const,
                        message: data.message ?? '',
                        code: 'too_many_attempts',
                        retryAfterSeconds: data.retryAfterSeconds,
                      };
                    }
                    return { ok: false as const, message: data.message ?? 'Ошибка' };
                  }}
                  onResend={async () => {
                    const email = emailLoginEmail.trim();
                    if (emailVerifyPurpose === 'specialist_signup') {
                      const password = specialistSignupPassword;
                      const lastName = specialistSignupLastName.trim();
                      const firstName = specialistSignupFirstName.trim();
                      const patronymic = specialistSignupPatronymic.trim();
                      const organizationTitle = specialistSignupOrganizationTitle.trim();
                      const organizationSlug = specialistSignupOrganizationSlug.trim();
                      if (
                        !email ||
                        !password ||
                        !lastName ||
                        !firstName ||
                        !organizationTitle ||
                        !organizationSlug
                      ) {
                        return {
                          kind: 'error' as const,
                          message:
                            'Заполните email, пароль, фамилию, имя, организацию и публичный адрес',
                        };
                      }
                      const r = await fetchJsonSafe<{
                        ok?: boolean;
                        challengeId?: string;
                        retryAfterSeconds?: number;
                        error?: string;
                        message?: string;
                      }>('/api/auth/specialist-signup/start', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                          email,
                          password,
                          lastName,
                          firstName,
                          patronymic: patronymic || undefined,
                          organizationTitle,
                          organizationSlug,
                        }),
                      });
                      if (!r.ok)
                        return { kind: 'error' as const, message: AUTH_NETWORK_ERROR_MESSAGE };
                      const { response: res, data } = r;
                      if (data.ok && data.challengeId) {
                        setEmailRegChallengeId(data.challengeId);
                        setEmailRegRetrySec(data.retryAfterSeconds ?? 60);
                        saveSpecialistSignupVerifyPending({
                          email,
                          challengeId: data.challengeId,
                          retryAfterSeconds: data.retryAfterSeconds ?? 60,
                          lastName,
                          firstName,
                          patronymic,
                          organizationTitle,
                          organizationSlug,
                        });
                        return { kind: 'ok' as const };
                      }
                      if (res.status === 429 || data.error === 'rate_limited') {
                        const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
                        setEmailRegRetrySec(sec);
                        return { kind: 'rate_limited' as const, retryAfterSeconds: sec };
                      }
                      if (res.status === 409 || data.error === 'duplicate_email') {
                        return {
                          kind: 'error' as const,
                          message: 'Аккаунт с этой почтой уже существует.',
                        };
                      }
                      return {
                        kind: 'error' as const,
                        message: data.message ?? 'Не удалось отправить код',
                      };
                    }
                    if (emailVerifyPurpose === 'email_otp') {
                      // Passwordless resend
                      if (!email)
                        return {
                          kind: 'error' as const,
                          message: 'Нет email для повторной отправки',
                        };
                      const r = await fetchJsonSafe<{
                        ok?: boolean;
                        challengeId?: string;
                        retryAfterSeconds?: number;
                        error?: string;
                        message?: string;
                      }>('/api/auth/email-otp/start', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ email }),
                      });
                      if (!r.ok)
                        return { kind: 'error' as const, message: AUTH_NETWORK_ERROR_MESSAGE };
                      const { response: res, data } = r;
                      if (data.ok && data.challengeId) {
                        setEmailRegChallengeId(data.challengeId);
                        setEmailRegRetrySec(data.retryAfterSeconds ?? 60);
                        return { kind: 'ok' as const };
                      }
                      if (res.status === 429 || data.error === 'rate_limited') {
                        const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
                        setEmailRegRetrySec(sec);
                        return { kind: 'rate_limited' as const, retryAfterSeconds: sec };
                      }
                      return {
                        kind: 'error' as const,
                        message: data.message ?? 'Не удалось отправить код',
                      };
                    }
                    if (emailVerifyPurpose === 'patient_registration') {
                      const lastName = emailRegLastName.trim();
                      const firstName = emailRegFirstName.trim();
                      const patronymic = emailRegPatronymic.trim();
                      if (!email || !lastName || !firstName)
                        return {
                          kind: 'error' as const,
                          message: 'Нет данных для повторной отправки',
                        };
                      const r = await fetchJsonSafe<{
                        ok?: boolean;
                        challengeId?: string;
                        retryAfterSeconds?: number;
                        error?: string;
                        message?: string;
                      }>('/api/auth/email-otp/register', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                          email,
                          lastName,
                          firstName,
                          patronymic: patronymic || undefined,
                        }),
                      });
                      if (!r.ok)
                        return { kind: 'error' as const, message: AUTH_NETWORK_ERROR_MESSAGE };
                      const { response: res, data } = r;
                      if (data.ok && data.challengeId) {
                        setEmailRegChallengeId(data.challengeId);
                        setEmailRegRetrySec(data.retryAfterSeconds ?? 60);
                        saveRegisterVerifyPending({
                          email,
                          challengeId: data.challengeId,
                          retryAfterSeconds: data.retryAfterSeconds ?? 60,
                          lastName,
                          firstName,
                          patronymic,
                          purpose: 'patient_email_otp',
                        });
                        return { kind: 'ok' as const };
                      }
                      if (res.status === 429 || data.error === 'rate_limited')
                        return {
                          kind: 'rate_limited' as const,
                          retryAfterSeconds: Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60)),
                        };
                      return {
                        kind: 'error' as const,
                        message: data.message ?? 'Не удалось отправить код',
                      };
                    }
                    const password = emailRegPassword;
                    const lastName = emailRegLastName.trim();
                    const firstName = emailRegFirstName.trim();
                    const patronymic = emailRegPatronymic.trim();
                    if (!email || !password || !lastName || !firstName) {
                      return {
                        kind: 'error' as const,
                        message: 'Нет данных для повторной отправки',
                      };
                    }
                    const resendRegisterResult = await fetchJsonSafe<{
                      ok?: boolean;
                      challengeId?: string;
                      retryAfterSeconds?: number;
                      error?: string;
                      message?: string;
                    }>(
                      emailVerifyPurpose === 'setup'
                        ? '/api/auth/email-password/setup-access'
                        : '/api/auth/email-password/register',
                      {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify(
                          emailVerifyPurpose === 'setup'
                            ? { email }
                            : {
                                email,
                                password,
                                lastName,
                                firstName,
                                patronymic: patronymic || undefined,
                              },
                        ),
                      },
                    );
                    if (!resendRegisterResult.ok) {
                      return { kind: 'error' as const, message: AUTH_NETWORK_ERROR_MESSAGE };
                    }
                    const { response: res, data } = resendRegisterResult;
                    if (data.ok && data.challengeId) {
                      setEmailRegChallengeId(data.challengeId);
                      setEmailRegRetrySec(data.retryAfterSeconds ?? 60);
                      if (emailVerifyPurpose === 'registration') {
                        saveRegisterVerifyPending({
                          email,
                          challengeId: data.challengeId,
                          retryAfterSeconds: data.retryAfterSeconds ?? 60,
                          lastName,
                          firstName,
                          patronymic,
                        });
                      }
                      return { kind: 'ok' as const };
                    }
                    if (res.status === 429 || data.error === 'rate_limited') {
                      const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
                      setEmailRegRetrySec(sec);
                      return { kind: 'rate_limited' as const, retryAfterSeconds: sec };
                    }
                    return {
                      kind: 'error' as const,
                      message: data.message ?? 'Не удалось отправить код',
                    };
                  }}
                  hideBack
                />
                <div className="mt-3 flex flex-col gap-2">
                  <p className={cn(patientMutedTextClass, 'break-all text-sm')}>
                    Код отправлен на {emailLoginEmail.trim()}
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    className={authLinkButtonClass}
                    disabled={loading}
                    onClick={() => {
                      clearAuthFlowPending();
                      setEmailRegChallengeId(null);
                      if (emailVerifyPurpose === 'specialist_signup') {
                        setEmailVerifyPurpose('specialist_signup');
                        setEmailAuthMode('specialist_signup');
                        return;
                      }
                      setEmailVerifyPurpose(
                        emailVerifyPurpose === 'patient_registration'
                          ? 'patient_registration'
                          : 'registration',
                      );
                      setEmailAuthMode(
                        emailVerifyPurpose === 'patient_registration'
                          ? 'patient_registration'
                          : 'login',
                      );
                    }}
                  >
                    {emailVerifyPurpose === 'specialist_signup'
                      ? 'Изменить данные'
                      : 'Изменить email'}
                  </Button>
                  {emailVerifyPurpose !== 'email_otp' &&
                  emailVerifyPurpose !== 'patient_registration' ? (
                    <div className="flex flex-col gap-1 pt-2">
                      <label htmlFor="auth-verify-resend-pwd" className={authFormFieldLabelClass}>
                        {emailVerifyPurpose === 'setup'
                          ? 'Пароль'
                          : 'Пароль (для повторной отправки кода)'}
                      </label>
                      <Input
                        id="auth-verify-resend-pwd"
                        type="password"
                        autoComplete="new-password"
                        value={
                          emailVerifyPurpose === 'specialist_signup'
                            ? specialistSignupPassword
                            : emailRegPassword
                        }
                        onChange={(e) =>
                          emailVerifyPurpose === 'specialist_signup'
                            ? setSpecialistSignupPassword(e.target.value)
                            : setEmailRegPassword(e.target.value)
                        }
                        disabled={loading}
                        className={authEmailInputClass}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }

  if (step === 'oauth_first') {
    return (
      <div
        id="auth-flow-v2-oauth-first"
        className={cn(authFlowShellClass, 'items-center text-center')}
      >
        <div className="flex w-full flex-col items-center gap-3">
          {oauthProviders.yandex ? (
            <Button
              type="button"
              variant="outline"
              className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void startOauth('yandex')}
            >
              Войти через Яндекс
            </Button>
          ) : null}
          {oauthProviders.google ? (
            <Button
              type="button"
              variant="outline"
              className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void startOauth('google')}
            >
              Войти через Google
            </Button>
          ) : null}
          {showAppleFallback ? (
            <Button
              type="button"
              variant="outline"
              className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void startOauth('apple')}
            >
              Войти через Apple
            </Button>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
          disabled={loading}
          onClick={() => openEmailPasswordLogin('oauth_first')}
        >
          Войти по email
        </Button>
        {phoneLoginEnabled ? (
          <Button
            type="button"
            variant="link"
            className={authLinkButtonClass}
            disabled={loading}
            onClick={() => setStep('phone_login')}
          >
            Войти по номеру телефона
          </Button>
        ) : null}
      </div>
    );
  }

  if (step === 'phone_login') {
    return (
      <div id="auth-flow-v2-phone-login" className={authFlowShellClass}>
        <PhoneMessengerAuthFlow
          channelPolicy={authChannelPolicy}
          purpose="login"
          onBack={() => setStep(hasWebOauthAlternatives ? 'oauth_first' : 'email_password')}
          onStaffFactorRequired={() => {
            openStaffFactorMode();
            setStep('email_password');
          }}
          supportContactHref={supportContactHref}
          nextParam={nextParam}
        />
      </div>
    );
  }

  if (step === 'phone') {
    const showPhoneSmsNotice = !isMessengerMiniAppHost();
    const showPhoneBack = !isMessengerMiniAppHost();

    return (
      <div id="auth-flow-v2-phone" className={cn(authFlowShellClass, 'items-center text-center')}>
        {showPhoneBack ? (
          <Button
            type="button"
            variant="link"
            className={authLinkButtonClass}
            disabled={loading}
            onClick={() => goBackToEntry()}
          >
            Войти без номера
          </Button>
        ) : null}
        {showPhoneSmsNotice ? (
          <p className={cn(authStepMutedParagraphClass, 'text-center')}>
            Подтверждение телефона по SMS временно недоступно. Вы можете войти или
            зарегистрироваться с номером телефона при помощи мессенджеров Telegram или Макс.
          </p>
        ) : null}
        <InternationalPhoneInput
          disabled={loading}
          onSubmit={runCheckPhone}
          submitLabel="Продолжить"
        />
      </div>
    );
  }

  if (step === 'new_user_foreign' && methods) {
    return (
      <div id="auth-flow-v2-new-user-foreign" className={cn(authFlowShellClass, 'text-left')}>
        <p className={authStepMutedParagraphClass}>
          В Mini App код приходит только в привязанный чат Telegram или Max. SMS отключён. Привязать
          бота можно в профиле после входа на сайте по email или OAuth.
        </p>
        {hasWebOauthAlternatives ? (
          <div className="flex w-full flex-col items-center gap-2">
            {oauthProviders.yandex ? (
              <Button
                type="button"
                variant="outline"
                className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                disabled={loading}
                onClick={() => void startOauth('yandex')}
              >
                Яндекс
              </Button>
            ) : null}
            {oauthProviders.google ? (
              <Button
                type="button"
                variant="outline"
                className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                disabled={loading}
                onClick={() => void startOauth('google')}
              >
                Google
              </Button>
            ) : null}
            {showAppleFallback ? (
              <Button
                type="button"
                variant="outline"
                className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                disabled={loading}
                onClick={() => void startOauth('apple')}
              >
                Apple
              </Button>
            ) : null}
          </div>
        ) : null}
        <Button
          type="button"
          variant="link"
          className={authLinkButtonClass}
          onClick={() => {
            goBackToEntry();
          }}
        >
          Изменить номер
        </Button>
      </div>
    );
  }

  if (step === 'foreign_no_otp_channel' && methods) {
    return (
      <div id="auth-flow-v2-foreign-no-otp" className={cn(authFlowShellClass, 'text-left')}>
        <p className={authStepMutedParagraphClass}>
          Для этого номера нет привязанного способа доставить код в Mini App. Откройте сайт и
          войдите по email или OAuth — затем привяжите бота в профиле.
        </p>
        {hasWebOauthAlternatives ? (
          <div className="flex w-full flex-col items-center gap-2">
            {oauthProviders.yandex ? (
              <Button
                type="button"
                variant="outline"
                className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                disabled={loading}
                onClick={() => void startOauth('yandex')}
              >
                Яндекс
              </Button>
            ) : null}
            {oauthProviders.google ? (
              <Button
                type="button"
                variant="outline"
                className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                disabled={loading}
                onClick={() => void startOauth('google')}
              >
                Google
              </Button>
            ) : null}
            {showAppleFallback ? (
              <Button
                type="button"
                variant="outline"
                className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                disabled={loading}
                onClick={() => void startOauth('apple')}
              >
                Apple
              </Button>
            ) : null}
          </div>
        ) : null}
        {supportContactHref ? (
          <SupportContactLink
            href={supportContactHref}
            className={cn(
              AUTH_LOGIN_PRIMARY_BUTTON_CLASS,
              'inline-flex items-center justify-center',
            )}
          >
            Связаться с поддержкой
          </SupportContactLink>
        ) : null}
        <Button
          type="button"
          variant="link"
          className={authLinkButtonClass}
          onClick={() => {
            goBackToEntry();
          }}
        >
          Другой номер
        </Button>
      </div>
    );
  }

  if (step === 'choose_channel' && methods) {
    return (
      <div id="auth-flow-v2-channel" className={cn(authFlowShellClass, 'text-left')}>
        {smsStartCooldownSec > 0 ? (
          <p className={patientMutedTextClass} role="status">
            Повторная отправка возможна через {smsStartCooldownSec} сек
          </p>
        ) : null}
        <ChannelPicker
          methods={methods}
          disabled={loading}
          onChoose={(ch) => void startPhoneOtp(ch, 'channel')}
        />
        <Button
          type="button"
          variant="link"
          className={authLinkButtonClass}
          onClick={() => {
            goBackToEntry();
          }}
        >
          Другой номер
        </Button>
      </div>
    );
  }

  if (step === 'code' && challengeId && methods) {
    const alternatives = buildAlternatives(methods, otpChannel, (ch) =>
      startPhoneOtp(ch, 'channel'),
    );

    return (
      <div id="auth-flow-v2-code" className={cn(authFlowShellClass, 'text-left')}>
        <OtpCodeForm
          challengeId={challengeId}
          retryAfterSeconds={retryAfterSeconds}
          supportContactHref={supportContactHref}
          submitLabel="Войти"
          description={otpDescription(otpChannel, methods.emailAddress)}
          alternatives={alternatives}
          onConfirm={async (code) => {
            engageInteractive();
            const chatId = getWebChatId();
            const confirmPhoneResult = await fetchJsonSafe<{
              ok?: boolean;
              redirectTo?: string;
              role?: 'client' | 'doctor' | 'admin';
              factorRequired?: boolean;
              message?: string;
              error?: string;
              retryAfterSeconds?: number;
            }>('/api/auth/phone/confirm', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                challengeId,
                code,
                channel: 'web',
                chatId,
                browserCalendarIana: getBrowserCalendarIanaForAuth(),
              }),
            });
            if (!confirmPhoneResult.ok) {
              return { ok: false as const, message: AUTH_NETWORK_ERROR_MESSAGE };
            }
            const { data } = confirmPhoneResult;
            if (data.ok && data.factorRequired) {
              openStaffFactorMode();
              setStep('email_password');
              return { ok: true as const };
            }
            if (data.ok && data.redirectTo) {
              redirectOk(data.redirectTo, data.role);
              return { ok: true as const, redirectTo: data.redirectTo };
            }
            if (data.error === 'rate_limited' && data.retryAfterSeconds != null) {
              return {
                ok: false as const,
                message: data.message ?? '',
                code: 'rate_limited',
                retryAfterSeconds: data.retryAfterSeconds,
              };
            }
            if (data.error === 'server_error') {
              return {
                ok: false as const,
                message: data.message ?? 'Не удалось завершить вход. Повторите ввод того же кода.',
                code: 'server_error',
              };
            }
            return { ok: false as const, message: data.message ?? 'Ошибка входа' };
          }}
          onResend={async () => {
            if (!phone) return { kind: 'error' as const, message: 'Нет номера' };
            if (otpChannel === 'sms') {
              return { kind: 'error' as const, message: SMS_DISABLED_WEB_MESSAGE };
            }
            const chatId = getWebChatId();
            const resendOtpResult = await fetchJsonSafe<{
              ok?: boolean;
              challengeId?: string;
              retryAfterSeconds?: number;
              error?: string;
              message?: string;
            }>('/api/auth/phone/start', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                phone,
                channel: 'web',
                chatId,
                deliveryChannel: otpChannel,
              }),
            });
            if (!resendOtpResult.ok) {
              return { kind: 'error' as const, message: AUTH_NETWORK_ERROR_MESSAGE };
            }
            const { response: res, data } = resendOtpResult;
            if (data.ok && data.challengeId) {
              setChallengeId(data.challengeId);
              setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
              return { kind: 'ok' as const };
            }
            if (res.status === 429 || data.error === 'rate_limited') {
              const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
              setRetryAfterSeconds(sec);
              return { kind: 'rate_limited' as const, retryAfterSeconds: sec };
            }
            return { kind: 'error' as const, message: data.message ?? 'Не удалось отправить код' };
          }}
          onBack={() => {
            if (exists || hasPublicWebOtpChannel(methods)) {
              setStep('choose_channel');
            } else {
              setStep('new_user_foreign');
            }
          }}
        />
      </div>
    );
  }

  return null;
}
