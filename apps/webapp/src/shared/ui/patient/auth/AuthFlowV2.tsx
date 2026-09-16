'use client';

/**
 * Публичный поток входа (browser): OAuth, email и подтверждение телефона в мессенджере.
 * Apple — только если нет Яндекса/Google. Вход по номеру всегда делегирован общему
 * PhoneMessengerAuthFlow, включая Messenger Mini App.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/patient/primitives/button';
import { Input } from '@/shared/ui/patient/primitives/input';
import { cn } from '@/lib/utils';
import { isMessengerMiniAppHost } from '@/shared/lib/messengerMiniApp';
import {
  FAIL_CLOSED_AUTH_CHANNEL_UI_POLICY,
  type AuthChannelUiPolicy,
} from '@/modules/auth/otpChannelUi';
import { getPostAuthRedirectTarget } from '@/modules/auth/redirectPolicy';
import type { RoleLoginPortal } from '@/modules/auth/roleLogin';
import type { SurfaceAuthPolicy } from '@/shared/lib/surface/requestSurface';
import {
  EMPTY_OAUTH_PROVIDER_FLAGS,
  hasAnyOAuthProvider,
  OAUTH_PROVIDER_REGISTRY,
  type OAuthProvider,
  type OAuthProviderFlags,
} from '@/modules/auth/oauthProviderRegistry';
import { markFreshLoginAfterAuth } from '@/shared/lib/webPush/freshLoginStorage';
import { OtpCodeForm } from '@/shared/ui/patient/auth/OtpCodeForm';
import {
  AUTH_LOGIN_ACCENT_TEXT_CLASS,
  AUTH_LOGIN_ENTRY_SHELL_PADDING_CLASS,
  AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS,
  AUTH_LOGIN_PRIMARY_BUTTON_CLASS,
  AUTH_LOGIN_SHELL_CLASS,
} from '@/shared/ui/patient/auth/loginChrome';
import {
  clearAuthFlowPending,
  readAuthFlowPending,
  saveRegisterVerifyPending,
  saveSpecialistSignupVerifyPending,
} from '@/shared/ui/patient/auth/authFlowPendingStorage';
import { getBrowserCalendarIanaForAuth } from '@/shared/lib/browserCalendarIana';
import {
  patientCaptionTextClass,
  patientFormLabelClass,
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
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_NAME_TOO_LONG_CODE,
  ORGANIZATION_NAME_TOO_LONG_MESSAGE,
} from '@/shared/lib/organizationName';
import type { OrganizationSlugMutationErrorCode } from '@/modules/clinic-directory/ports';
import { staffSecurityErrorText } from '@/shared/ui/auth/staffSecurityErrorText';
import { PasswordAltchaChallenge } from '@/shared/ui/auth/PasswordAltchaChallenge';
import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { AppContentLoading } from '@/shared/ui/AppContentLoading';
import { notificationText } from '@/shared/notifications/notificationText';

// Local aliases, not copy: both texts live in the dictionary (a hoisted const holding the
// literal itself used to be invisible to the coverage gate — final-audit MAJOR, 13.09).
const AUTH_NETWORK_ERROR_MESSAGE = notificationText.commonNoServerConnection;

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
  AUTH_LOGIN_SHELL_CLASS,
  patientInnerPageStackClass,
  'mx-auto w-full max-w-sm',
);

const authStepMutedParagraphClass = cn(patientMutedTextClass, 'text-balance');

const authLinkButtonClass = cn(
  'border-none bg-transparent',
  'h-auto min-h-0 px-0 py-0',
  patientInlineLinkClass,
  'underline-offset-2',
  AUTH_LOGIN_ACCENT_TEXT_CLASS,
);

const authFormFieldLabelClass = patientFormLabelClass;
const authEmailInputClass = 'w-full bg-white';

export type AuthFlowStep = 'entry_loading' | 'oauth_first' | 'phone_login' | 'email_password';

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

export type PrefetchedPublicAuthConfig = {
  oauthProviders: OAuthProviderFlags;
  passkeyEnabled?: boolean;
  telegramBotUsername: string | null;
  maxBotOpenUrl: string | null;
  vkWebLoginUrl: string | null;
  smsFallbackEnabled: boolean;
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
  roleLoginPortal?: RoleLoginPortal | null;
  /** Прямая ссылка на восстановление пароля (`?recover=1`) — открывает экран email+пароль. */
  openPasswordRecovery?: boolean;
  /** Proxy-resolved surface capabilities; absent only for isolated legacy callers. */
  surfaceAuthPolicy?: SurfaceAuthPolicy;
  /** Opens email directly while retaining OAuth/passkey as available alternatives. */
  preferEmailEntry?: boolean;
};

export function AuthFlowV2({
  nextParam,
  supportContactHref,
  onStepChange,
  prefetchedAuthConfig,
  initialDevView,
  onInteractiveLoginEngaged,
  roleLoginPortal = null,
  openPasswordRecovery = false,
  surfaceAuthPolicy,
  preferEmailEntry = false,
}: AuthFlowV2Props) {
  const router = useRouter();
  const engageInteractive = useCallback(() => {
    onInteractiveLoginEngaged?.();
  }, [onInteractiveLoginEngaged]);
  const [step, setStep] = useState<AuthFlowStep>('entry_loading');
  const pendingHydratedRef = useRef(false);
  const initialDevViewAppliedRef = useRef(false);
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderFlags>(
    EMPTY_OAUTH_PROVIDER_FLAGS,
  );
  const [loading, setLoading] = useState(false);
  const [emailLoginEmail, setEmailLoginEmail] = useState('');
  const [emailLoginPassword, setEmailLoginPassword] = useState('');
  const [passwordAltchaRequired, setPasswordAltchaRequired] = useState(false);
  const [passwordAltchaPayload, setPasswordAltchaPayload] = useState<string | null>(null);
  const [passwordAltchaGeneration, setPasswordAltchaGeneration] = useState(0);
  const [staffFactorCode, setStaffFactorCode] = useState('');
  const [staffFactorUseRecovery, setStaffFactorUseRecovery] = useState(false);
  const [staffFactorMethod, setStaffFactorMethod] = useState<'totp' | 'email'>('totp');
  const [emailAuthMode, setEmailAuthMode] = useState<
    | 'login'
    | 'patient_registration'
    | 'verify'
    | 'specialist_signup'
    | 'password_login'
    | 'staff_factor'
  >('login');
  const [emailVerifyPurpose, setEmailVerifyPurpose] = useState<
    'patient_registration' | 'email_otp' | 'specialist_signup'
  >('patient_registration');
  const [emailRegChallengeId, setEmailRegChallengeId] = useState<string | null>(null);
  const [emailRegRetrySec, setEmailRegRetrySec] = useState(60);
  const [emailPasswordReturn, setEmailPasswordReturn] = useState<'oauth_first' | 'email_password'>(
    'oauth_first',
  );
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
  /**
   * `request_email` — отдельный шаг «куда прислать код» (владелец 14.09.2026: «кнопка „Забыл
   * пароль“ вместо формы ввода имейл (без пароля) говорит введите пароль»). До него кнопка сразу
   * слала запрос по тому, что набрано в форме входа, и на пустом поле отвечала тостом «Укажите
   * email» — то есть требовала заполнить форму входа, чтобы из неё выйти.
   */
  const [pwRecoveryPhase, setPwRecoveryPhase] = useState<'none' | 'request_email' | 'reset_code'>(
    'none',
  );
  const [pwResetEmail, setPwResetEmail] = useState('');
  const [pwResetCode, setPwResetCode] = useState('');
  const [pwNewPassword, setPwNewPassword] = useState('');
  const specialistSignupEnabled = prefetchedAuthConfig?.specialistSignupEnabled === true;
  const authChannelPolicy =
    prefetchedAuthConfig?.authChannelPolicy ?? FAIL_CLOSED_AUTH_CHANNEL_UI_POLICY;
  const surfaceAllows = useCallback(
    (method: SurfaceAuthPolicy['availableMethods'][number]) =>
      !surfaceAuthPolicy || surfaceAuthPolicy.availableMethods.includes(method),
    [surfaceAuthPolicy],
  );
  const passwordLoginEnabled = surfaceAllows('password');
  const emailOtpEnabled = surfaceAllows('email_code') && authChannelPolicy.email;
  const messengerPhoneEnabled = authChannelPolicy.telegram || authChannelPolicy.max;
  const phoneLoginEnabled = surfaceAllows('phone_bot') && messengerPhoneEnabled;
  const passkeyEnabled = surfaceAllows('passkey') && prefetchedAuthConfig?.passkeyEnabled === true;
  const patientRegistrationEnabled = roleLoginPortal !== 'doctor' && roleLoginPortal !== 'admin';
  const specialistSignupEntryEnabled = roleLoginPortal !== 'patient' && roleLoginPortal !== 'admin';

  useEffect(() => {
    if (isMessengerMiniAppHost()) {
      setOauthProviders(EMPTY_OAUTH_PROVIDER_FLAGS);
      if (surfaceAllows('phone_bot') && messengerPhoneEnabled) {
        setStep('phone_login');
      } else if (passwordLoginEnabled) {
        setEmailAuthMode('password_login');
        setStep('email_password');
      }
      return;
    }

    const oauth = surfaceAllows('oauth')
      ? (prefetchedAuthConfig?.oauthProviders ?? EMPTY_OAUTH_PROVIDER_FLAGS)
      : EMPTY_OAUTH_PROVIDER_FLAGS;
    setOauthProviders(oauth);
    const oauthOn = hasAnyOAuthProvider(oauth) || passkeyEnabled;
    if (!emailOtpEnabled && passwordLoginEnabled) setEmailAuthMode('password_login');
    // `?recover=1` — человек пришёл по ссылке из письма «кто-то пытается зарегистрироваться на
    // ваш email». Ему нужен экран email+пароль, где стоит «Забыли пароль?»; сам код мы не
    // запрашиваем — отправку кода человек начинает сам, нажав кнопку.
    if (openPasswordRecovery && passwordLoginEnabled) {
      setEmailAuthMode('password_login');
      setStep('email_password');
      return;
    }
    setStep(
      preferEmailEntry && (emailOtpEnabled || passwordLoginEnabled)
        ? 'email_password'
        : oauthOn
          ? 'oauth_first'
          : 'email_password',
    );
  }, [
    prefetchedAuthConfig,
    emailOtpEnabled,
    messengerPhoneEnabled,
    openPasswordRecovery,
    passkeyEnabled,
    passwordLoginEnabled,
    preferEmailEntry,
    surfaceAllows,
  ]);

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
    if (specialistSignupEnabled) {
      setEmailVerifyPurpose('specialist_signup');
      setEmailAuthMode('specialist_signup');
    } else if (passwordLoginEnabled) {
      setEmailAuthMode('password_login');
    }
  }, [engageInteractive, initialDevView, passwordLoginEnabled, specialistSignupEnabled, step]);

  useEffect(() => {
    if (pendingHydratedRef.current) return;
    if (typeof window === 'undefined') return;
    if (isMessengerMiniAppHost()) return;
    if (step !== 'oauth_first' && step !== 'email_password') return;
    pendingHydratedRef.current = true;
    const p = readAuthFlowPending();
    if (!p) return;
    // A password-reset draft can survive in sessionStorage while the person moves between doors.
    // Patient surfaces have no password method, so they must return to their working email-code
    // entry instead of hydrating the staff-only reset form.
    if (p.mode === 'password_reset' && !passwordLoginEnabled) {
      clearAuthFlowPending();
      setEmailAuthMode('login');
      return;
    }
    if (!emailOtpEnabled && passwordLoginEnabled && p.mode !== 'password_reset') {
      clearAuthFlowPending();
      setEmailAuthMode('password_login');
      return;
    }
    const prefetchedOauthReturn: 'oauth_first' | 'email_password' = hasAnyOAuthProvider(
      prefetchedAuthConfig?.oauthProviders,
    )
      ? 'oauth_first'
      : 'email_password';
    if (p.mode === 'register_verify') {
      if (p.purpose !== 'patient_email_otp') {
        clearAuthFlowPending();
        return;
      }
      engageInteractive();
      setStep('email_password');
      setEmailPasswordReturn(prefetchedOauthReturn);
      setEmailLoginEmail(p.email);
      setEmailRegLastName(p.lastName ?? '');
      setEmailRegFirstName(p.firstName ?? '');
      setEmailRegPatronymic(p.patronymic ?? '');
      setEmailRegChallengeId(p.challengeId);
      setEmailVerifyPurpose('patient_registration');
      setEmailAuthMode('verify');
      setEmailRegRetrySec(p.retryAfterSeconds);
    } else if (p.mode === 'specialist_signup_verify') {
      if (!specialistSignupEnabled) {
        clearAuthFlowPending();
        return;
      }
      engageInteractive();
      setStep('email_password');
      setEmailPasswordReturn(prefetchedOauthReturn);
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
      setEmailPasswordReturn(prefetchedOauthReturn);
      setEmailAuthMode('login');
      setPwRecoveryPhase('reset_code');
      setPwResetEmail(p.email);
    }
  }, [
    step,
    prefetchedAuthConfig,
    engageInteractive,
    specialistSignupEnabled,
    emailOtpEnabled,
    passwordLoginEnabled,
  ]);

  const startOauth = async (provider: OAuthProvider) => {
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
          ...(roleLoginPortal ? { roleLoginPortal } : {}),
          ...(roleLoginPortal && nextParam ? { next: nextParam } : {}),
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
        toast.error(data.message ?? notificationText.authTooManyAttempts);
        return;
      }
      toast.error(data.message ?? notificationText.authProviderUnavailable);
    } finally {
      setLoading(false);
    }
  };

  /** Основной ряд — все провайдеры реестра кроме Apple, показанные когда включены и настроены. */
  const mainRowOauthProviders = OAUTH_PROVIDER_REGISTRY.filter(
    (meta) => meta.provider !== 'apple' && oauthProviders[meta.provider],
  );
  const showOauthRow = mainRowOauthProviders.length > 0;
  /** Apple в основном ряду только если нет Яндекса и Google — иначе основной набор провайдеров без Apple (продуктовое правило). */
  const showAppleFallback =
    oauthProviders.apple && !oauthProviders.yandex && !oauthProviders.google;
  const hasWebOauthAlternatives = showOauthRow || showAppleFallback || passkeyEnabled;

  const resetEmailAuthFields = () => {
    setEmailAuthMode('login');
    setEmailVerifyPurpose('patient_registration');
    setEmailRegChallengeId(null);
    setEmailRegRetrySec(60);
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
    setPwResetEmail('');
    setPwResetCode('');
    setPwNewPassword('');
  };

  const goBackToEntry = () => {
    resetEmailAuthFields();
    pendingHydratedRef.current = false;
    clearAuthFlowPending();
    if (!isMessengerMiniAppHost()) {
      setStep(hasWebOauthAlternatives ? 'oauth_first' : 'email_password');
    } else {
      setStep('phone_login');
    }
  };

  const resetToOtherMethods = () => {
    pendingHydratedRef.current = false;
    clearAuthFlowPending();
    resetEmailAuthFields();
    if (!isMessengerMiniAppHost()) {
      setStep(hasWebOauthAlternatives ? 'oauth_first' : 'email_password');
    } else {
      setStep('phone_login');
    }
  };

  const openEmailPasswordLogin = (returnTo: 'oauth_first' | 'email_password') => {
    if (!emailOtpEnabled && !passwordLoginEnabled) return;
    engageInteractive();
    setEmailPasswordReturn(returnTo);
    resetEmailAuthFields();
    if (!emailOtpEnabled && passwordLoginEnabled) setEmailAuthMode('password_login');
    setStep('email_password');
  };

  /** New passwordless email-OTP start handler. */
  const submitEmailOtpStart = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailOtpEnabled) return;
    engageInteractive();
    const email = emailLoginEmail.trim();
    if (!email) {
      toast.error(notificationText.commonSpecifyEmail);
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
        body: JSON.stringify({
          email,
          ...(roleLoginPortal ? { roleLoginPortal } : {}),
        }),
      });
      if (!result.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { data } = result;
      if (!data.ok) {
        toast.error(data.message ?? notificationText.authCodeSendFailed);
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
      toast.error(notificationText.authSpecifyEmailNameSurname);
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
      toast.error(data.message ?? notificationText.authSignupStartFailed);
    } finally {
      setLoading(false);
    }
  };

  /** Staff/professional entry: switch the shared login screen to email+password. */
  const openPasswordLoginMode = () => {
    if (!passwordLoginEnabled) return;
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
   * account exists). Reset versus first-time setup is selected only after the submitted code proves
   * the address, so this entry point never asks or reveals which account state was found.
   */
  /** Кнопка «Забыли пароль?» — это переход на шаг, а не отправка: адрес спрашиваем здесь. */
  const openForgotPassword = () => {
    setPwResetEmail(emailLoginEmail.trim());
    setPwResetCode('');
    setPwNewPassword('');
    setPwRecoveryPhase('request_email');
  };

  const submitForgotPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const email = pwResetEmail.trim();
    if (!email) {
      toast.error(notificationText.commonSpecifyEmail);
      return;
    }
    engageInteractive();
    setLoading(true);
    try {
      const result = await fetchJsonSafe<{
        ok?: boolean;
        retryAfterSeconds?: number;
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
        toast.error(notificationText.authPasswordRecoveryUnavailable);
        return;
      }
      setEmailLoginPassword('');
      setPwResetEmail(email);
      setPwResetCode('');
      setPwNewPassword('');
      setPwRecoveryPhase('reset_code');
      // Neutral wording on purpose: the endpoint never confirms or denies account existence.
      toast.success(notificationText.authEmailCodeSentIfExists);
    } finally {
      setLoading(false);
    }
  };

  const openStaffFactorMode = (method: 'totp' | 'email' = 'totp') => {
    setEmailLoginPassword('');
    setStaffFactorCode('');
    setStaffFactorMethod(method);
    setStaffFactorUseRecovery(false);
    setEmailAuthMode('staff_factor');
  };

  const startPasskeyLogin = async (): Promise<void> => {
    engageInteractive();
    setLoading(true);
    try {
      const optionsResult = await fetchJsonSafe<{
        ok?: boolean;
        challengeId?: string;
        options?: PublicKeyCredentialRequestOptionsJSON;
        error?: string;
        message?: string;
      }>('/api/auth/passkey/login/options', { method: 'POST' });
      if (
        !optionsResult.ok ||
        !optionsResult.response.ok ||
        !optionsResult.data.ok ||
        !optionsResult.data.challengeId ||
        !optionsResult.data.options
      ) {
        if (optionsResult.ok && optionsResult.data.error === 'auth_method_disabled') {
          toast.error(notificationText.authPasskeyDisabled);
        } else {
          toast.error(
            optionsResult.ok
              ? (optionsResult.data.message ?? AUTH_NETWORK_ERROR_MESSAGE)
              : AUTH_NETWORK_ERROR_MESSAGE,
          );
        }
        return;
      }

      const assertion = await startAuthentication({ optionsJSON: optionsResult.data.options });
      const verifyResult = await fetchJsonSafe<{
        ok?: boolean;
        redirectTo?: string;
        role?: 'client' | 'doctor' | 'admin';
        factorRequired?: boolean;
        factorMethod?: 'totp' | 'email';
        message?: string;
      }>('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: optionsResult.data.challengeId,
          response: assertion,
        }),
      });
      if (!verifyResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      if (verifyResult.data.ok && verifyResult.data.factorRequired) {
        openStaffFactorMode();
        setStep('email_password');
        return;
      }
      if (verifyResult.data.ok && verifyResult.data.redirectTo) {
        redirectOk(verifyResult.data.redirectTo);
        return;
      }
      toast.error(verifyResult.data.message ?? notificationText.authPasskeyVerifyFailed);
    } catch (error) {
      if (error instanceof Error && error.name === 'NotAllowedError') return;
      toast.error(notificationText.authPasskeyVerifyFailed);
    } finally {
      setLoading(false);
    }
  };

  const submitEmailPasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    engageInteractive();
    const email = emailLoginEmail.trim();
    const password = emailLoginPassword;
    if (!email || !password) {
      toast.error(notificationText.authEnterEmailAndPassword);
      return;
    }
    setLoading(true);
    try {
      const loginResult = await fetchJsonSafe<{
        ok?: boolean;
        redirectTo?: string;
        role?: 'client' | 'doctor' | 'admin';
        factorRequired?: boolean;
        factorMethod?: 'totp' | 'email';
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
          ...(passwordAltchaPayload ? { captcha: passwordAltchaPayload } : {}),
          ...(roleLoginPortal ? { roleLoginPortal } : {}),
        }),
      });
      if (!loginResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { response: res, data } = loginResult;
      if (data.ok && data.factorRequired) {
        openStaffFactorMode(data.factorMethod);
        return;
      }
      if (data.ok && data.redirectTo) {
        setEmailLoginPassword('');
        redirectOk(data.redirectTo, data.role);
        return;
      }
      if (res.status === 409 || data.error === 'email_not_verified') {
        toast.error(data.message ?? notificationText.authEmailNotVerifiedRetryLogin);
        return;
      }
      // Признаки капчи разбираем до разбора кода отказа: их приносит не только «неверные данные»,
      // но и «проверка недоступна». Виджет в этом случае обязан начаться заново — токен Яндекса
      // одноразовый, и повторная отправка уже потраченного сожгла бы человеку следующую попытку.
      if (data.captchaRefreshRequired) {
        setPasswordAltchaRequired(true);
        setPasswordAltchaPayload(null);
        setPasswordAltchaGeneration((current) => current + 1);
      } else if (data.captchaRequired) {
        setPasswordAltchaRequired(true);
      }
      if (data.error === 'invalid_credentials') {
        toast.error(data.message ?? notificationText.authInvalidCredentialsOrPortalDenied);
        return;
      }
      // Every other known code (proxy_configuration, rate_limited, invalid_body,
      // security_setup_pending, server_error) carries its own server message; an unrecognized or
      // empty body falls through to the action fallback, which reads as our failure, not theirs.
      toast.error(data.message ?? staffSecurityErrorText(data.error, 'email_password_login'));
    } finally {
      setLoading(false);
    }
  };

  const submitStaffFactor = async (e: FormEvent) => {
    e.preventDefault();
    const value = staffFactorCode.trim();
    if (!value) return toast.error(notificationText.authEnterCode);
    setLoading(true);
    try {
      const result = await fetchJsonSafe<{
        ok?: boolean;
        redirectTo?: string;
        role?: 'client' | 'doctor' | 'admin';
        error?: string;
      }>('/api/auth/email-password/login/factor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(staffFactorUseRecovery ? { recoveryCode: value } : { code: value }),
      });
      if (!result.ok) return toast.error(AUTH_NETWORK_ERROR_MESSAGE);
      if (result.data.ok && result.data.redirectTo) {
        setStaffFactorCode('');
        redirectOk(result.data.redirectTo, result.data.role);
        return;
      }
      toast.error(staffSecurityErrorText(result.data.error, 'login_factor'));
    } finally {
      setLoading(false);
    }
  };

  const openSpecialistSignup = () => {
    if (!specialistSignupEnabled) {
      toast.error(notificationText.doctorSignupUnavailable);
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
      toast.error(notificationText.commonFillAllFields);
      return;
    }
    if (password.length < 8) {
      toast.error(notificationText.authSignupPasswordTooShort);
      return;
    }
    if (organizationTitle.length > ORGANIZATION_NAME_MAX_LENGTH) {
      toast.error(ORGANIZATION_NAME_TOO_LONG_MESSAGE);
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
      if (data.error === ORGANIZATION_NAME_TOO_LONG_CODE) {
        toast.error(data.message ?? ORGANIZATION_NAME_TOO_LONG_MESSAGE);
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
        toast.error(data.message ?? notificationText.authTooManyAttempts);
        return;
      }
      toast.error(data.message ?? notificationText.authSignupStartFailed);
    } finally {
      setLoading(false);
    }
  };

  const redirectOk = (redirectTo: string, role?: 'client' | 'doctor' | 'admin') => {
    clearAuthFlowPending();
    markFreshLoginAfterAuth();
    const target = getPostAuthRedirectTarget(
      role ?? 'client',
      nextParam,
      redirectTo,
      roleLoginPortal,
      { showAccessDeniedToast: false },
    );
    router.replace(target);
  };

  const submitPasswordResetFinalize = async (e: FormEvent) => {
    e.preventDefault();
    engageInteractive();
    const email = pwResetEmail.trim();
    if (!email || !pwResetCode.trim() || pwNewPassword.length < 8) {
      toast.error(notificationText.authEnterCodeAndNewPassword);
      return;
    }
    setLoading(true);
    try {
      const resetResult = await fetchJsonSafe<{
        ok?: boolean;
        redirectTo?: string;
        role?: 'client' | 'doctor' | 'admin';
        error?: string;
        message?: string;
        retryAfterSeconds?: number;
      }>('/api/auth/email-password/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code: pwResetCode.trim(), newPassword: pwNewPassword }),
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
        setPwResetCode('');
        setPwNewPassword('');
        toast.success(notificationText.authPasswordUpdatedPleaseLogin);
        setEmailLoginEmail(email);
        setEmailAuthMode('login');
        return;
      }
      if (res.status === 429 || data.error === 'too_many_attempts') {
        toast.error(data.message ?? notificationText.authTooManyAttempts);
        return;
      }
      if (data.error === 'expired_code') {
        toast.error(notificationText.authCodeInvalidOrExpired);
        return;
      }
      toast.error(data.message ?? notificationText.authCodeInvalidOrExpired);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'entry_loading') {
    return (
      <div id="auth-flow-v2-entry-loading" className={authFlowShellClass}>
        <AppContentLoading className="py-6" />
      </div>
    );
  }

  if (step === 'email_password') {
    // У специалиста отдельного экрана выбора нет: email+пароль — первый экран, passkey остаётся
    // вторичной ссылкой прямо на форме (владелец 16.09). У остальных дверей oauth_first остаётся
    // реальным шагом выбора, когда есть OAuth/passkey-альтернативы.
    const doctorEmailFirst = roleLoginPortal === 'doctor';
    const canReturnToOauthFirst =
      !doctorEmailFirst && emailPasswordReturn === 'oauth_first' && hasWebOauthAlternatives;

    const showEmailChromeBack =
      pwRecoveryPhase !== 'none' || emailAuthMode === 'verify' || canReturnToOauthFirst;

    const topBackLabel =
      pwRecoveryPhase !== 'none'
        ? 'Назад'
        : emailAuthMode === 'verify'
          ? 'Войти другим способом'
          : canReturnToOauthFirst
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
              if (pwRecoveryPhase !== 'none') {
                setPwRecoveryPhase('none');
                setPwResetCode('');
                setPwNewPassword('');
                setPwResetEmail('');
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

        {pwRecoveryPhase === 'request_email' ? (
          <form
            className="mt-3 flex w-full flex-col gap-3"
            onSubmit={(e) => void submitForgotPassword(e)}
          >
            <p className={authStepMutedParagraphClass}>
              Укажите почту — пришлём на неё код для смены пароля.
            </p>
            <div className="flex flex-col gap-1">
              <label htmlFor="auth-pw-recovery-email" className={authFormFieldLabelClass}>
                Email
              </label>
              <Input
                id="auth-pw-recovery-email"
                type="email"
                name="email"
                autoComplete="email"
                autoFocus
                value={pwResetEmail}
                onChange={(e) => setPwResetEmail(e.target.value)}
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
              Прислать код
            </Button>
          </form>
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
            {emailOtpEnabled && emailAuthMode === 'login' ? (
              <form
                className="mt-3 flex w-full flex-col gap-3"
                onSubmit={(e) => void submitEmailOtpStart(e)}
              >
                <p className={authStepMutedParagraphClass}>
                  {notificationText.authEmailCodeDeliveryHint}
                </p>
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
                {patientRegistrationEnabled ? (
                  <Button
                    type="button"
                    variant="link"
                    className={authLinkButtonClass}
                    disabled={loading}
                    onClick={openPatientEmailRegistration}
                  >
                    Зарегистрироваться
                  </Button>
                ) : null}
                {specialistSignupEntryEnabled && specialistSignupEnabled ? (
                  // The doctor door has its own registration page now (`/app/doctor/register`,
                  // owner 12.09: "две разные страницы"), so it navigates there instead of
                  // toggling this same form's fields in place. Every other entry (generic `/app`,
                  // messenger miniapp) has no such page yet — keeps the in-place toggle.
                  roleLoginPortal === 'doctor' ? (
                    <Link href="/app/doctor/register" className={authLinkButtonClass}>
                      Зарегистрироваться
                    </Link>
                  ) : (
                    <Button
                      type="button"
                      variant="link"
                      className={authLinkButtonClass}
                      disabled={loading}
                      onClick={openSpecialistSignup}
                    >
                      Я специалист
                    </Button>
                  )
                ) : null}
                {passwordLoginEnabled ? (
                  <Button
                    type="button"
                    variant="link"
                    className={authLinkButtonClass}
                    disabled={loading}
                    onClick={openPasswordLoginMode}
                  >
                    Войти по паролю
                  </Button>
                ) : null}
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

            {passwordLoginEnabled && emailAuthMode === 'password_login' ? (
              <form
                className="mt-3 flex w-full flex-col gap-3"
                onSubmit={(e) => void submitEmailPasswordLogin(e)}
              >
                <p className={authStepMutedParagraphClass}>Вход по email и паролю.</p>
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
                  onClick={openForgotPassword}
                >
                  Забыли пароль?
                </Button>
                {doctorEmailFirst && passkeyEnabled ? (
                  <Button
                    type="button"
                    variant="link"
                    className={authLinkButtonClass}
                    disabled={loading}
                    onClick={() => void startPasskeyLogin()}
                  >
                    Войти с Passkey
                  </Button>
                ) : null}
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
                {roleLoginPortal === 'doctor' && specialistSignupEnabled ? (
                  // This step has no other path back to "Я специалист"/register — that link lives
                  // on the OTP-mode form above, which password_login replaces entirely.
                  <Link href="/app/doctor/register" className={authLinkButtonClass}>
                    Зарегистрироваться
                  </Link>
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
                    : staffFactorMethod === 'email'
                      ? 'Введите код, отправленный на подтверждённый email.'
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
                {staffFactorMethod === 'totp' ? (
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
                ) : null}
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
                    maxLength={ORGANIZATION_NAME_MAX_LENGTH}
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
                  <span className={patientCaptionTextClass}>
                    /book/{specialistSignupOrganizationSlug || 'adres-kliniki'}
                  </span>
                  {specialistSignupSlugMessage ? (
                    <span
                      role={specialistSignupSlugStatus === 'error' ? 'alert' : 'status'}
                      className={cn(
                        patientCaptionTextClass,
                        specialistSignupSlugStatus === 'error'
                          ? 'patient-text-danger'
                          : 'patient-text-secondary',
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
                {roleLoginPortal === 'doctor' ? (
                  // Own registration page (`/app/doctor/register`) navigates back to its own login
                  // page rather than toggling this form's mode in place — same split as the
                  // "Зарегистрироваться" link above. The generic-entry fallback below predates that
                  // split and its "Войти как пациент" label was never right for a specialist here;
                  // left as-is for the entries that still share this one in-place toggle.
                  <Link href="/app/doctor/login" className={authLinkButtonClass}>
                    Уже есть аккаунт — войти
                  </Link>
                ) : (
                  <Button
                    type="button"
                    variant="link"
                    className={authLinkButtonClass}
                    disabled={loading}
                    onClick={() => {
                      clearAuthFlowPending();
                      setEmailAuthMode('login');
                      setEmailVerifyPurpose('patient_registration');
                      setEmailRegChallengeId(null);
                      setEmailRegRetrySec(60);
                    }}
                  >
                    Войти как пациент
                  </Button>
                )}
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
                    <span className={patientCaptionTextClass}>
                      /book/{specialistSignupOrganizationSlug || 'adres-kliniki'}
                    </span>
                    {specialistSignupSlugMessage ? (
                      <span
                        role={specialistSignupSlugStatus === 'error' ? 'alert' : 'status'}
                        className={cn(
                          patientCaptionTextClass,
                          specialistSignupSlugStatus === 'error'
                            ? 'patient-text-danger'
                            : 'patient-text-secondary',
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
                        setEmailVerifyPurpose('patient_registration');
                        setEmailAuthMode('login');
                        toast.error(
                          data.message ?? notificationText.authReenterPasswordToContinueSetup,
                        );
                        return { ok: false as const, message: data.message ?? 'Повторите вход.' };
                      }
                      if (data.error === 'organization_slug_required') {
                        setSpecialistSignupSlugRecovery(true);
                        return {
                          ok: false as const,
                          message:
                            data.message ??
                            'Выберите публичный адрес организации и повторите подтверждение.',
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
                        return {
                          ok: false as const,
                          message: notificationText.authCodeInvalidOrExpired,
                        };
                      }
                      return {
                        ok: false as const,
                        message: data.message ?? 'Не удалось подтвердить код',
                      };
                    }
                    // Дальше цель только одна по устройству: вход по коду и регистрация пациента
                    // идут одной passwordless-дверью, установки пароля в пациентском потоке нет.
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
                      body: JSON.stringify({
                        email: emailLoginEmail.trim(),
                        code,
                        ...(roleLoginPortal ? { roleLoginPortal } : {}),
                      }),
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
                    return {
                      ok: false as const,
                      message: data.message ?? notificationText.authCodeInvalidOrExpired,
                    };
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
                        body: JSON.stringify({
                          email,
                          ...(roleLoginPortal ? { roleLoginPortal } : {}),
                        }),
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
                    if (!email) {
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
                    }>('/api/auth/email-password/forgot', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ email }),
                    });
                    if (!resendRegisterResult.ok) {
                      return { kind: 'error' as const, message: AUTH_NETWORK_ERROR_MESSAGE };
                    }
                    const { response: res, data } = resendRegisterResult;
                    if (data.ok) {
                      setEmailRegChallengeId(data.challengeId ?? null);
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
                  }}
                  hideBack
                />
                <div className="mt-3 flex flex-col gap-2">
                  <p className={cn(patientMutedTextClass, 'break-all')}>
                    {notificationText.authEmailCodeSent} {emailLoginEmail.trim()}
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
                          : 'email_otp',
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
                  {emailVerifyPurpose === 'specialist_signup' ? (
                    <div className="flex flex-col gap-1 pt-2">
                      <label htmlFor="auth-verify-resend-pwd" className={authFormFieldLabelClass}>
                        Пароль (для повторной отправки кода)
                      </label>
                      <Input
                        id="auth-verify-resend-pwd"
                        type="password"
                        autoComplete="new-password"
                        value={specialistSignupPassword}
                        onChange={(e) => setSpecialistSignupPassword(e.target.value)}
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
        className={cn(
          authFlowShellClass,
          AUTH_LOGIN_ENTRY_SHELL_PADDING_CLASS,
          'items-center text-center',
        )}
      >
        <div className="flex w-full flex-col items-center gap-3">
          {passkeyEnabled ? (
            <Button
              type="button"
              variant="outline"
              className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void startPasskeyLogin()}
            >
              Войти по ключу доступа
            </Button>
          ) : null}
          {mainRowOauthProviders.map((meta) => (
            <Button
              key={meta.provider}
              type="button"
              variant="outline"
              className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void startOauth(meta.provider)}
            >
              {meta.loginLabel}
            </Button>
          ))}
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
        {emailOtpEnabled || passwordLoginEnabled ? (
          <Button
            type="button"
            variant="outline"
            className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
            disabled={loading}
            onClick={() => openEmailPasswordLogin('oauth_first')}
          >
            Войти по email
          </Button>
        ) : null}
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
        {/* Связь с поддержкой — в самом низу блока с кнопками (владелец 15.09). Это первый экран
            входа: именно здесь человек застревает, если ни один способ ему не подходит, и здесь же
            ссылка на помощь стоит у почти всех, у кого мы смотрели. Из правового подвала страницы
            она убрана, чтобы не стоять в двух местах сразу. */}
        {supportContactHref ? (
          <SupportContactLink href={supportContactHref} className={authLinkButtonClass}>
            Связь с поддержкой
          </SupportContactLink>
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
          nextParam={nextParam}
        />
      </div>
    );
  }

  return null;
}
