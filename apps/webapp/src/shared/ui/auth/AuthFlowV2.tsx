"use client";

/**
 * Публичный поток входа (browser): Яндекс, Google, Apple и email (вход / регистрация / код).
 * Apple — только если нет Яндекса/Google. Телефон и OTP только в Telegram/MAX Mini App (отдельный шаг phone).
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import type { AuthMethodsPayload } from "@/modules/auth/checkPhoneMethods";
import {
  isOtpChannelAvailablePublic,
  OTP_PUBLIC_OTHER_CHANNELS_ORDER,
  pickOtpChannelWithPreferencePublic,
} from "@/modules/auth/otpChannelUi";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { markFreshLoginAfterAuth } from "@/shared/lib/webPush/freshLoginStorage";
import { ChannelPicker } from "@/shared/ui/auth/ChannelPicker";
import { OtpCodeForm, type OtpAlternativeEntry, type OtpResendOutcome } from "@/shared/ui/auth/OtpCodeForm";
import { InternationalPhoneInput } from "@/shared/ui/auth/InternationalPhoneInput";
import {
  AUTH_LOGIN_ACCENT_TEXT_CLASS,
  AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS,
  AUTH_LOGIN_OUTLINE_BUTTON_CLASS,
  AUTH_LOGIN_PRIMARY_BUTTON_CLASS,
} from "@/shared/ui/auth/loginChrome";
import {
  clearAuthFlowPending,
  readAuthFlowPending,
  savePasswordResetPending,
  saveRegisterVerifyPending,
} from "@/shared/ui/auth/authFlowPendingStorage";
import { getBrowserCalendarIanaForAuth } from "@/shared/lib/browserCalendarIana";
import {
  patientHeroBookingSectionClass,
  patientInnerPageStackClass,
  patientInlineLinkClass,
  patientMutedTextClass,
} from "@/shared/ui/patientVisual";
import { SupportContactLink } from "@/shared/ui/SupportContactLink";
import { PhoneMessengerAuthFlow } from "@/shared/ui/auth/PhoneMessengerAuthFlow";

const WEB_CHAT_ID_KEY = "bersoncare_web_chat_id";

const SMS_DISABLED_WEB_MESSAGE =
  "SMS для входа с сайта отключён. Используйте код в Telegram, Max или на email.";
const AUTH_NETWORK_ERROR_MESSAGE = "Нет связи с сервером. Проверьте интернет и повторите.";

type FetchJsonResult<T> =
  | { ok: true; response: Response; data: T }
  | { ok: false };

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
  "mx-auto w-full max-w-sm",
);

const authStepMutedParagraphClass = cn(patientMutedTextClass, "text-balance");

const authLinkButtonClass = cn(
  "border-none bg-transparent",
  "h-auto min-h-0 px-0 py-0 text-sm",
  patientInlineLinkClass,
  "underline-offset-2",
  "font-medium",
  AUTH_LOGIN_ACCENT_TEXT_CLASS,
);

const authFormFieldLabelClass = cn(patientMutedTextClass, "text-sm");
const authEmailInputClass = "w-full bg-white";

function getWebChatId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(WEB_CHAT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(WEB_CHAT_ID_KEY, id);
  }
  return id;
}

export type AuthFlowStep =
  | "entry_loading"
  | "oauth_first"
  | "phone_login"
  | "phone"
  | "email_password"
  | "new_user_foreign"
  | "foreign_no_otp_channel"
  | "choose_channel"
  | "code";

type OtpChannel = "sms" | "telegram" | "max" | "email";

function hasPublicWebOtpChannel(methods: AuthMethodsPayload): boolean {
  return (
    isOtpChannelAvailablePublic(methods, "telegram") ||
    isOtpChannelAvailablePublic(methods, "max") ||
    isOtpChannelAvailablePublic(methods, "email")
  );
}

function otpDescription(channel: OtpChannel, emailAddress?: string): string {
  switch (channel) {
    case "telegram":
      return "Введите код, отправленный вам в Telegram.";
    case "max":
      return "Введите код, отправленный вам в Max.";
    case "email":
      return `Введите код, отправленный вам${emailAddress ? ` на ${emailAddress}` : " на email"}.`;
    default:
      return "Введите код, отправленный вам.";
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
    if (ch === "telegram") {
      result.push({
        label: "Получить код в Telegram",
        onClick: async () => {
          await onChoose("telegram");
        },
      });
      continue;
    }
    if (ch === "max") {
      result.push({
        label: "Получить код в Max",
        onClick: async () => {
          await onChoose("max");
        },
      });
      continue;
    }
    result.push({
      label: `Получить код на email${methods.emailAddress ? ` (${methods.emailAddress})` : ""}`,
      onClick: async () => {
        await onChoose("email");
      },
    });
  }
  return result;
}

function withContactSupportReturn(supportHref: string | undefined, fromParam: string): string | undefined {
  const raw = supportHref?.trim();
  if (!raw) return raw;
  if (!raw.includes("contact-support")) return raw;
  return raw.includes("?")
    ? `${raw}&from=${encodeURIComponent(fromParam)}`
    : `${raw}?from=${encodeURIComponent(fromParam)}`;
}

type OauthProviderFlags = { yandex: boolean; google: boolean; apple: boolean };

export type PrefetchedPublicAuthConfig = {
  oauthProviders: OauthProviderFlags;
  telegramBotUsername: string | null;
  maxBotOpenUrl: string | null;
  fetchedAt: number;
};

type AuthFlowV2Props = {
  nextParam: string | null;
  supportContactHref?: string;
  onStepChange?: (step: AuthFlowStep) => void;
  /** Сид из `AuthBootstrap` prefetch (публичные конфиги входа). */
  prefetchedAuthConfig?: PrefetchedPublicAuthConfig | null;
  /** Пользователь начал интерактивный вход (OAuth / телефон / код) — не перехватывать UI поздним initData. */
  onInteractiveLoginEngaged?: () => void;
};

export function AuthFlowV2({
  nextParam,
  supportContactHref,
  onStepChange,
  prefetchedAuthConfig,
  onInteractiveLoginEngaged,
}: AuthFlowV2Props) {
  const router = useRouter();
  const engageInteractive = useCallback(() => {
    onInteractiveLoginEngaged?.();
  }, [onInteractiveLoginEngaged]);
  const [step, setStep] = useState<AuthFlowStep>("entry_loading");
  const pendingHydratedRef = useRef(false);
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
  const [otpChannel, setOtpChannel] = useState<OtpChannel>("telegram");
  const [otpEntrySource, setOtpEntrySource] = useState<"registration" | "channel" | "auto" | null>(null);
  const [emailLoginEmail, setEmailLoginEmail] = useState("");
  const [emailLoginPassword, setEmailLoginPassword] = useState("");
  const [emailRegPassword, setEmailRegPassword] = useState("");
  const [emailAuthMode, setEmailAuthMode] = useState<"login" | "register" | "verify">("login");
  const [emailVerifyPurpose, setEmailVerifyPurpose] = useState<"registration" | "setup">("registration");
  const [emailRegChallengeId, setEmailRegChallengeId] = useState<string | null>(null);
  const [emailRegAttemptId, setEmailRegAttemptId] = useState<string | null>(null);
  const [emailRegRetrySec, setEmailRegRetrySec] = useState(60);
  const [emailPasswordReturn, setEmailPasswordReturn] =
    useState<"oauth_first" | "phone" | "email_password">("oauth_first");
  const [emailRegDisplayName, setEmailRegDisplayName] = useState("");
  const [pwRecoveryPhase, setPwRecoveryPhase] = useState<"none" | "forgot_email" | "reset_code">("none");
  const [pwRecoveryPurpose, setPwRecoveryPurpose] = useState<"reset" | "setup">("reset");
  const [pwResetEmail, setPwResetEmail] = useState("");
  const [pwResetChallengeId, setPwResetChallengeId] = useState<string | null>(null);
  const [pwResetCode, setPwResetCode] = useState("");
  const [pwNewPassword, setPwNewPassword] = useState("");
  const [emailSetupPromptEmail, setEmailSetupPromptEmail] = useState<string | null>(null);

  useEffect(() => {
    if (smsStartCooldownSec <= 0) return;
    const t = window.setTimeout(() => setSmsStartCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [smsStartCooldownSec]);

  useEffect(() => {
    if (isMessengerMiniAppHost()) {
      setOauthProviders({ yandex: false, google: false, apple: false });
      setStep("phone");
      return;
    }

    const oauth = prefetchedAuthConfig?.oauthProviders ?? { yandex: false, google: false, apple: false };
    setOauthProviders(oauth);
    const oauthOn = oauth.yandex || oauth.google || oauth.apple;
    setStep(oauthOn ? "oauth_first" : "email_password");
  }, [prefetchedAuthConfig]);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    if (pendingHydratedRef.current) return;
    if (typeof window === "undefined") return;
    if (isMessengerMiniAppHost()) return;
    if (step !== "oauth_first" && step !== "email_password") return;
    pendingHydratedRef.current = true;
    const p = readAuthFlowPending();
    if (!p) return;
    if (p.mode === "register_verify") {
      engageInteractive();
      setStep("email_password");
      setEmailPasswordReturn((prefetchedAuthConfig?.oauthProviders?.yandex || prefetchedAuthConfig?.oauthProviders?.google || prefetchedAuthConfig?.oauthProviders?.apple) ? "oauth_first" : "email_password");
      setEmailLoginEmail(p.email);
      setEmailRegDisplayName(p.displayName);
      setEmailRegChallengeId(p.challengeId);
      setEmailRegAttemptId(p.attemptId ?? null);
      setEmailVerifyPurpose("registration");
      setEmailAuthMode("verify");
      setEmailRegRetrySec(p.retryAfterSeconds);
    } else if (p.mode === "password_reset") {
      engageInteractive();
      setStep("email_password");
      setEmailPasswordReturn((prefetchedAuthConfig?.oauthProviders?.yandex || prefetchedAuthConfig?.oauthProviders?.google || prefetchedAuthConfig?.oauthProviders?.apple) ? "oauth_first" : "email_password");
      setEmailAuthMode("login");
      setPwRecoveryPhase("reset_code");
      setPwRecoveryPurpose("reset");
      setPwResetEmail(p.email);
      setPwResetChallengeId(p.challengeId ?? null);
    }
  }, [step, prefetchedAuthConfig, engageInteractive]);

  const startOauth = async (provider: "yandex" | "google" | "apple") => {
    engageInteractive();
    setLoading(true);
    try {
      const oauthResult = await fetchJsonSafe<{
        ok?: boolean;
        authUrl?: string;
        message?: string;
        error?: string;
      }>("/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
      if (res.status === 429 || data.error === "rate_limited") {
        toast.error(data.message ?? "Слишком много попыток. Попробуйте позже.");
        return;
      }
      toast.error(data.message ?? "Провайдер недоступен");
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
    setEmailAuthMode("login");
    setEmailVerifyPurpose("registration");
    setEmailRegChallengeId(null);
    setEmailRegRetrySec(60);
    setEmailRegPassword("");
    setEmailRegDisplayName("");
    setEmailLoginEmail("");
    setEmailLoginPassword("");
    setPwRecoveryPhase("none");
    setPwRecoveryPurpose("reset");
    setPwResetEmail("");
    setPwResetChallengeId(null);
    setPwResetCode("");
    setPwNewPassword("");
    setEmailSetupPromptEmail(null);
  };

  const lookupEmailAuthState = async (
    email: string,
  ): Promise<
    | "free"
    | "pending_registration"
    | "verified_with_password"
    | "needs_email_setup"
    | "email_conflict"
    | "network_error"
    | null
  > => {
    const lookupResult = await fetchJsonSafe<{ ok?: boolean; state?: string }>(
      "/api/auth/email-password/lookup",
      {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
      },
    );
    if (!lookupResult.ok) {
      return "network_error";
    }
    const { response: res, data } = lookupResult;
    if (!res.ok || !data.ok || typeof data.state !== "string") {
      return null;
    }
    return data.state as
      | "free"
      | "pending_registration"
      | "verified_with_password"
      | "needs_email_setup"
      | "email_conflict";
  };

  const startEmailSetupCode = async (
    email: string,
  ): Promise<
    | { kind: "ok"; challengeId: string; retryAfterSeconds: number }
    | { kind: "rate_limited"; retryAfterSeconds: number }
    | { kind: "failed"; message?: string }
    | { kind: "network_error" }
  > => {
    const setupCodeResult = await fetchJsonSafe<{
      ok?: boolean;
      challengeId?: string;
      retryAfterSeconds?: number;
      error?: string;
      message?: string;
    }>("/api/auth/email-password/setup-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!setupCodeResult.ok) {
      return { kind: "network_error" };
    }
    const { response: res, data } = setupCodeResult;
    if (data.ok && data.challengeId) {
      return {
        kind: "ok",
        challengeId: data.challengeId,
        retryAfterSeconds: data.retryAfterSeconds ?? 60,
      };
    }
    if (res.status === 429 || data.error === "rate_limited") {
      return { kind: "rate_limited", retryAfterSeconds: Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60)) };
    }
    return { kind: "failed", message: data.message };
  };

  const goBackToEntry = () => {
    setSmsStartCooldownSec(0);
    resetEmailAuthFields();
    pendingHydratedRef.current = false;
    clearAuthFlowPending();
    if (!isMessengerMiniAppHost()) {
      setStep(hasWebOauthAlternatives ? "oauth_first" : "email_password");
    } else {
      setStep("phone");
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
      setStep(hasWebOauthAlternatives ? "oauth_first" : "email_password");
      setPhone(null);
      setMethods(null);
    } else {
      setStep("phone");
      setPhone(null);
      setMethods(null);
    }
  };

  const openEmailPasswordLogin = (returnTo: "oauth_first" | "phone" | "email_password") => {
    engageInteractive();
    setEmailPasswordReturn(returnTo);
    resetEmailAuthFields();
    setStep("email_password");
  };

  const submitEmailPasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    engageInteractive();
    const email = emailLoginEmail.trim();
    if (!email || !emailLoginPassword) {
      toast.error("Введите email и пароль");
      return;
    }
    setLoading(true);
    try {
      const loginResult = await fetchJsonSafe<{
        ok?: boolean;
        redirectTo?: string;
        role?: "client" | "doctor" | "admin";
        error?: string;
      }>("/api/auth/email-password/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: emailLoginPassword }),
      });
      if (!loginResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { response: res, data } = loginResult;
      if (data.ok && data.redirectTo) {
        redirectOk(data.redirectTo, data.role);
        return;
      }
      if (res.status === 409 || data.error === "email_not_verified") {
        const dn = email.split("@")[0] || "Пациент";
        const registerResult = await fetchJsonSafe<{
          ok?: boolean;
          challengeId?: string;
          attemptId?: string;
          retryAfterSeconds?: number;
          message?: string;
          error?: string;
        }>("/api/auth/email-password/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password: emailLoginPassword, displayName: dn }),
        });
        if (!registerResult.ok) {
          toast.error(AUTH_NETWORK_ERROR_MESSAGE);
          return;
        }
        const { response: resReg, data: regData } = registerResult;
        if (regData.ok && regData.error === "existing_account_needs_email_setup") {
          if (regData.challengeId) {
            setEmailSetupPromptEmail(null);
            setEmailRegPassword(emailLoginPassword);
            setEmailRegChallengeId(regData.challengeId);
            setEmailRegAttemptId(regData.attemptId ?? null);
            setEmailRegRetrySec(regData.retryAfterSeconds ?? 60);
            setEmailVerifyPurpose("setup");
            setEmailAuthMode("verify");
            toast.success("Отправили код на почту.");
          } else {
            setEmailSetupPromptEmail(email);
          }
          return;
        }
        if (regData.ok && regData.challengeId) {
          saveRegisterVerifyPending({
            email,
            challengeId: regData.challengeId,
            attemptId: regData.attemptId,
            retryAfterSeconds: regData.retryAfterSeconds ?? 60,
            displayName: dn,
          });
          setEmailRegDisplayName("");
          setEmailRegPassword(emailLoginPassword);
          setEmailRegChallengeId(regData.challengeId);
          setEmailRegAttemptId(regData.attemptId ?? null);
          setEmailRegRetrySec(regData.retryAfterSeconds ?? 60);
          setEmailVerifyPurpose("registration");
          setEmailAuthMode("verify");
          toast.success("Подтвердите email — отправили код.");
          return;
        }
        if (resReg.status === 409 || regData.error === "duplicate_email") {
          toast.error("Войдите с паролем или восстановите доступ.");
          return;
        }
        toast.error(regData.message ?? "Не удалось отправить код");
        return;
      }
      if (res.status === 401 || data.error === "invalid_credentials") {
        const lookupState = await lookupEmailAuthState(email);
        if (lookupState === "network_error") {
          toast.error(AUTH_NETWORK_ERROR_MESSAGE);
          return;
        }
        if (lookupState === "needs_email_setup") {
          const setup = await startEmailSetupCode(email);
          if (setup.kind === "network_error") {
            toast.error(AUTH_NETWORK_ERROR_MESSAGE);
            return;
          }
          if (setup.kind === "ok") {
            setEmailSetupPromptEmail(null);
            setEmailRegPassword(emailLoginPassword);
            setEmailRegChallengeId(setup.challengeId);
            setEmailRegAttemptId(null);
            setEmailRegRetrySec(setup.retryAfterSeconds);
            setEmailVerifyPurpose("setup");
            setEmailAuthMode("verify");
            toast.success("Отправили код на почту.");
            return;
          }
          if (setup.kind === "rate_limited") {
            setEmailRegRetrySec(setup.retryAfterSeconds);
            toast.error("Код уже отправлен. Проверьте почту.");
            return;
          }
          setEmailSetupPromptEmail(email);
          return;
        }
        if (lookupState === "email_conflict") {
          toast.error("Обратитесь в поддержку.");
          return;
        }
        toast.error("Неверный email или пароль");
        return;
      }
      toast.error("Не удалось войти");
    } finally {
      setLoading(false);
    }
  };

  const submitEmailRegister = async (e: FormEvent) => {
    e.preventDefault();
    engageInteractive();
    const email = emailLoginEmail.trim();
    const password = emailRegPassword;
    const displayName = emailRegDisplayName.trim();
    if (!displayName) {
      toast.error("Введите имя");
      return;
    }
    if (displayName.length > 200) {
      toast.error("Имя не длиннее 200 символов");
      return;
    }
    if (!email || !password) {
      toast.error("Введите email и пароль");
      return;
    }
    if (password.length < 8) {
      toast.error("Пароль не менее 8 символов");
      return;
    }
    setLoading(true);
    try {
      const registerResult = await fetchJsonSafe<{
        ok?: boolean;
        challengeId?: string;
        attemptId?: string;
        retryAfterSeconds?: number;
        error?: string;
        message?: string;
      }>("/api/auth/email-password/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      if (!registerResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { response: res, data } = registerResult;
      if (data.ok && data.error === "existing_account_needs_email_setup") {
        if (data.challengeId) {
          setEmailSetupPromptEmail(null);
          setEmailRegChallengeId(data.challengeId);
          setEmailRegAttemptId(data.attemptId ?? null);
          setEmailRegRetrySec(data.retryAfterSeconds ?? 60);
          setEmailVerifyPurpose("setup");
          setEmailAuthMode("verify");
          toast.success("Отправили код на почту.");
        } else {
          setEmailSetupPromptEmail(email);
        }
        return;
      }
      if (res.status === 409 || data.error === "duplicate_email") {
        toast.error("Войдите с паролем или восстановите доступ.");
        return;
      }
      if (res.status === 409 || data.error === "email_conflict") {
        toast.error("Обратитесь в поддержку.");
        return;
      }
      if (data.ok && data.challengeId) {
        saveRegisterVerifyPending({
          email,
          challengeId: data.challengeId,
          attemptId: data.attemptId,
          retryAfterSeconds: data.retryAfterSeconds ?? 60,
          displayName,
        });
        setEmailRegChallengeId(data.challengeId);
        setEmailRegAttemptId(data.attemptId ?? null);
        setEmailRegRetrySec(data.retryAfterSeconds ?? 60);
        setEmailVerifyPurpose("registration");
        setEmailAuthMode("verify");
        return;
      }
      if (res.status === 429 || data.error === "rate_limited") {
        toast.error(data.message ?? "Слишком частые запросы");
        return;
      }
      toast.error(data.message ?? "Не удалось отправить код");
    } finally {
      setLoading(false);
    }
  };

  const redirectOk = (redirectTo: string, role?: "client" | "doctor" | "admin") => {
    clearAuthFlowPending();
    markFreshLoginAfterAuth();
    const target = getPostAuthRedirectTarget(role ?? "client", nextParam, redirectTo);
    router.replace(target);
  };

  const submitPasswordForgotRequest = async (e: FormEvent) => {
    e.preventDefault();
    engageInteractive();
    const email = (pwRecoveryPhase === "forgot_email" ? pwResetEmail : emailLoginEmail).trim();
    if (!email) {
      toast.error("Введите email");
      return;
    }
    setLoading(true);
    try {
      const lookupState = await lookupEmailAuthState(email);
      if (lookupState === "network_error") {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      if (lookupState === "needs_email_setup") {
        const forgotForSetupResult = await fetchJsonSafe<{
          ok?: boolean;
          challengeId?: string;
          retryAfterSeconds?: number;
        }>("/api/auth/email-password/forgot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!forgotForSetupResult.ok) {
          toast.error(AUTH_NETWORK_ERROR_MESSAGE);
          return;
        }
        const { data } = forgotForSetupResult;
        if (!data.ok) {
          toast.error("Не удалось выполнить запрос");
          return;
        }
        if (!data.challengeId) {
          setPwRecoveryPhase("none");
          setEmailSetupPromptEmail(email);
          toast.error("Код уже отправлен. Проверьте почту или запросите повторно позже.");
          return;
        }
        setEmailSetupPromptEmail(null);
        setPwResetEmail(email);
        setPwResetChallengeId(data.challengeId);
        setPwResetCode("");
        setPwNewPassword("");
        setPwRecoveryPurpose("setup");
        setPwRecoveryPhase("reset_code");
        savePasswordResetPending({
          email,
          retryAfterSeconds: data.retryAfterSeconds ?? 60,
          challengeId: data.challengeId,
        });
        toast.success("Отправили код на почту.");
        return;
      }
      if (lookupState === "email_conflict") {
        toast.error("Обратитесь в поддержку.");
        return;
      }

      const forgotResult = await fetchJsonSafe<{ ok?: boolean; retryAfterSeconds?: number }>(
        "/api/auth/email-password/forgot",
        {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
        },
      );
      if (!forgotResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { data } = forgotResult;
      if (!data.ok) {
        toast.error("Не удалось выполнить запрос");
        return;
      }
      if (lookupState !== "verified_with_password") {
        toast.success("Если такой email есть в системе, на почту отправлено письмо. Проверьте «Спам».");
        return;
      }
      const sec = Math.max(1, Math.ceil(Number(data.retryAfterSeconds) || 60));
      savePasswordResetPending({ email, retryAfterSeconds: sec });
      setPwResetEmail(email);
      setPwResetChallengeId(null);
      setPwRecoveryPurpose("reset");
      setPwRecoveryPhase("reset_code");
      toast.success(
        "Если такой email есть в системе, на почту отправлен код. Проверьте папку «Спам».",
      );
    } finally {
      setLoading(false);
    }
  };

  const submitEmailSetupAccessResend = async () => {
    const email = emailSetupPromptEmail?.trim();
    if (!email) return;
    engageInteractive();
    setLoading(true);
    try {
      const result = await startEmailSetupCode(email);
      if (result.kind === "network_error") {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      if (result.kind === "ok") {
        setEmailSetupPromptEmail(null);
        setEmailRegChallengeId(result.challengeId);
        setEmailRegAttemptId(null);
        setEmailRegRetrySec(result.retryAfterSeconds);
        setEmailVerifyPurpose("setup");
        setEmailAuthMode("verify");
        toast.success("Отправили код на почту.");
        return;
      }
      if (result.kind === "rate_limited") {
        setEmailRegRetrySec(result.retryAfterSeconds);
        toast.error("Код уже отправлен. Проверьте почту.");
        return;
      }
      toast.error("Не удалось отправить письмо");
    } finally {
      setLoading(false);
    }
  };

  const submitPasswordResetFinalize = async (e: FormEvent) => {
    e.preventDefault();
    engageInteractive();
    const email = pwResetEmail.trim();
    if (!email || !pwResetCode.trim() || pwNewPassword.length < 8) {
      toast.error("Введите код и новый пароль (не менее 8 символов)");
      return;
    }
    setLoading(true);
    try {
      const endpoint =
        pwRecoveryPurpose === "setup"
          ? "/api/auth/email-password/setup-code/complete"
          : "/api/auth/email-password/reset";
      const resetResult = await fetchJsonSafe<{
        ok?: boolean;
        redirectTo?: string;
        role?: "client" | "doctor" | "admin";
        error?: string;
        message?: string;
        retryAfterSeconds?: number;
      }>(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          pwRecoveryPurpose === "setup"
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
        setPwRecoveryPhase("none");
        setPwRecoveryPurpose("reset");
        setPwResetChallengeId(null);
        setPwResetCode("");
        setPwNewPassword("");
        toast.success(pwRecoveryPurpose === "setup" ? "Доступ настроен." : "Пароль обновлён. Войдите.");
        setEmailLoginEmail(email);
        setEmailLoginPassword("");
        setEmailAuthMode("login");
        return;
      }
      if (res.status === 429 || data.error === "too_many_attempts") {
        toast.error(data.message ?? "Слишком частые попытки");
        return;
      }
      if (data.error === "expired_code") {
        toast.error("Код истёк. Запросите новый.");
        return;
      }
      toast.error(data.message ?? "Неверный или просроченный код");
    } finally {
      setLoading(false);
    }
  };

  const startPhoneOtp = async (
    deliveryChannel: OtpChannel,
    entry: "registration" | "channel" | "auto",
    phoneForRequest?: string | null,
  ): Promise<OtpResendOutcome> => {
    const effectivePhone = phoneForRequest ?? phone;
    if (!effectivePhone) return { kind: "error", message: "Нет номера телефона" };
    if (deliveryChannel === "sms") {
      toast.error(SMS_DISABLED_WEB_MESSAGE);
      return { kind: "error", message: SMS_DISABLED_WEB_MESSAGE };
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
      }>("/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: effectivePhone, channel: "web", chatId, deliveryChannel }),
      });
      if (!startOtpResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return { kind: "error", message: AUTH_NETWORK_ERROR_MESSAGE };
      }
      const { response: res, data } = startOtpResult;
      if (!res.ok || !data.ok || !data.challengeId) {
        if (res.status === 429 || data.error === "rate_limited") {
          const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
          setSmsStartCooldownSec(sec);
          return { kind: "rate_limited", retryAfterSeconds: sec };
        }
        const message = data.message ?? "Не удалось отправить код";
        toast.error(message);
        return { kind: "error", message };
      }
      setSmsStartCooldownSec(0);
      setChallengeId(data.challengeId);
      setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
      setOtpChannel(deliveryChannel);
      setOtpEntrySource(entry);
      setStep("code");
      return { kind: "ok" };
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
      }>("/api/auth/check-phone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      if (!checkPhoneResult.ok) {
        toast.error(AUTH_NETWORK_ERROR_MESSAGE);
        return;
      }
      const { response: res, data } = checkPhoneResult;
      if (!res.ok || !data.ok || !data.methods) {
        toast.error("Не удалось проверить номер");
        return;
      }
      setPhone(normalized);
      setExists(Boolean(data.exists));
      setMethods(data.methods);
      if (!data.exists) {
        setStep(hasPublicWebOtpChannel(data.methods) ? "choose_channel" : "new_user_foreign");
      } else {
        const primary = pickOtpChannelWithPreferencePublic(data.methods, data.preferredOtpChannel);
        const hasPublicChannel = hasPublicWebOtpChannel(data.methods);
        if (primary == null) {
          setStep(hasPublicChannel ? "choose_channel" : "foreign_no_otp_channel");
        } else {
          const outcome = await startPhoneOtp(primary, "auto", normalized);
          if (outcome.kind !== "ok") {
            setStep("choose_channel");
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (step === "entry_loading") {
    return (
      <div id="auth-flow-v2-entry-loading" className={cn(authFlowShellClass, patientMutedTextClass, "text-center")}>
        Загрузка…
      </div>
    );
  }

  if (step === "email_password") {
    const showEmailChromeBack =
      emailSetupPromptEmail != null ||
      pwRecoveryPhase !== "none" ||
      emailAuthMode === "verify" ||
      emailPasswordReturn === "oauth_first" ||
      emailPasswordReturn === "phone";

    const topBackLabel =
      emailSetupPromptEmail != null
        ? "Назад"
        : pwRecoveryPhase !== "none"
        ? "Назад"
        : emailAuthMode === "verify"
          ? "Войти другим способом"
          : emailPasswordReturn === "oauth_first"
            ? "К выбору входа"
            : "Назад";

    return (
      <div id="auth-flow-v2-email-password" className={cn(authFlowShellClass, "w-full text-left")}>
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
              if (pwRecoveryPhase !== "none") {
                setPwRecoveryPhase("none");
                setPwRecoveryPurpose("reset");
                setPwResetCode("");
                setPwNewPassword("");
                setPwResetEmail("");
                setPwResetChallengeId(null);
                return;
              }
              if (emailAuthMode === "verify") {
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
            <p className={cn(patientMutedTextClass, "break-all text-sm")}>{emailSetupPromptEmail}</p>
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
        ) : pwRecoveryPhase === "forgot_email" ? (
          <form className="mt-3 flex w-full flex-col gap-3" onSubmit={(e) => void submitPasswordForgotRequest(e)}>
            <p className={patientMutedTextClass}>Укажите email учётной записи. Ответ будет одинаковым независимо от наличия почты.</p>
            <div className="flex flex-col gap-1">
              <label htmlFor="auth-pw-forgot-email" className={authFormFieldLabelClass}>
                Email
              </label>
              <Input
                id="auth-pw-forgot-email"
                type="email"
                autoComplete="email"
                value={pwResetEmail}
                onChange={(e) => setPwResetEmail(e.target.value)}
                disabled={loading}
                className={authEmailInputClass}
              />
            </div>
            <Button type="submit" variant="outline" className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS} disabled={loading}>
              Отправить код
            </Button>
          </form>
        ) : pwRecoveryPhase === "reset_code" ? (
          <form className="mt-3 flex w-full flex-col gap-3" onSubmit={(e) => void submitPasswordResetFinalize(e)}>
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
                onChange={(e) => setPwResetCode(e.target.value.replace(/\D/g, ""))}
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
            <Button type="submit" variant="outline" className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS} disabled={loading}>
              Сохранить пароль
            </Button>
          </form>
        ) : (
          <>
            {emailAuthMode !== "verify" ? (
              <div
                role="tablist"
                aria-label="Режим входа по email"
                className="mt-3 grid grid-cols-2 gap-1.5"
              >
                <button
                  id="auth-email-tab-login"
                  type="button"
                  role="tab"
                  aria-selected={emailAuthMode === "login"}
                  disabled={loading}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    emailAuthMode === "login"
                      ? "border-[var(--patient-color-primary,#284da0)] bg-[var(--patient-color-primary-soft)]/40 text-[#1a3366]"
                      : "border-[var(--patient-border)] bg-white text-[var(--patient-text-muted)] hover:bg-[var(--patient-color-primary-soft)]/25",
                  )}
                  onClick={() => setEmailAuthMode("login")}
                >
                  Вход
                </button>
                <button
                  id="auth-email-tab-register"
                  type="button"
                  role="tab"
                  aria-selected={emailAuthMode === "register"}
                  disabled={loading}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    emailAuthMode === "register"
                      ? "border-[var(--patient-color-primary,#284da0)] bg-[var(--patient-color-primary-soft)]/40 text-[#1a3366]"
                      : "border-[var(--patient-border)] bg-white text-[var(--patient-text-muted)] hover:bg-[var(--patient-color-primary-soft)]/25",
                  )}
                  onClick={() => setEmailAuthMode("register")}
                >
                  Регистрация
                </button>
              </div>
            ) : null}

            {emailAuthMode === "login" ? (
          <form
            role="tabpanel"
            aria-labelledby="auth-email-tab-login"
            className="mt-3 flex w-full flex-col gap-3"
            onSubmit={(e) => void submitEmailPasswordLogin(e)}
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="auth-email-login" className={authFormFieldLabelClass}>
                Email
              </label>
              <Input
                id="auth-email-login"
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
              <label htmlFor="auth-password-login" className={authFormFieldLabelClass}>
                Пароль
              </label>
              <Input
                id="auth-password-login"
                type="password"
                name="password"
                autoComplete="current-password"
                value={emailLoginPassword}
                onChange={(e) => setEmailLoginPassword(e.target.value)}
                disabled={loading}
                className={authEmailInputClass}
              />
            </div>
            <Button type="submit" variant="outline" className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS} disabled={loading}>
              Войти
            </Button>
            <button
              type="button"
              className={cn(authLinkButtonClass, "self-start")}
              disabled={loading}
              onClick={() => {
                setPwResetEmail(emailLoginEmail);
                setPwRecoveryPhase("forgot_email");
              }}
            >
              Забыли пароль?
            </button>
          </form>
        ) : null}

        {emailAuthMode === "register" ? (
          <form
            role="tabpanel"
            aria-labelledby="auth-email-tab-register"
            className="mt-3 flex w-full flex-col gap-3"
            onSubmit={(e) => void submitEmailRegister(e)}
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="auth-reg-name" className={authFormFieldLabelClass}>
                Имя
              </label>
              <Input
                id="auth-reg-name"
                type="text"
                name="reg-name"
                autoComplete="name"
                aria-label="Имя"
                value={emailRegDisplayName}
                maxLength={200}
                onChange={(e) => setEmailRegDisplayName(e.target.value)}
                disabled={loading}
                className={authEmailInputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="auth-reg-email" className={authFormFieldLabelClass}>
                Email
              </label>
              <Input
                id="auth-reg-email"
                type="email"
                name="reg-email"
                autoComplete="email"
                inputMode="email"
                value={emailLoginEmail}
                onChange={(e) => setEmailLoginEmail(e.target.value)}
                disabled={loading}
                className={authEmailInputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="auth-reg-password" className={authFormFieldLabelClass}>
                Пароль
              </label>
              <Input
                id="auth-reg-password"
                type="password"
                name="reg-password"
                autoComplete="new-password"
                value={emailRegPassword}
                onChange={(e) => setEmailRegPassword(e.target.value)}
                disabled={loading}
                className={authEmailInputClass}
              />
            </div>
            <Button type="submit" variant="outline" className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS} disabled={loading}>
              Продолжить
            </Button>
          </form>
        ) : null}

        {emailAuthMode === "verify" && emailRegChallengeId ? (
          <div className="mt-2">
            <OtpCodeForm
              challengeId={emailRegChallengeId}
              retryAfterSeconds={emailRegRetrySec}
              supportContactHref={withContactSupportReturn(supportContactHref, "verify")}
              submitLabel="Продолжить"
              description="Введите код из письма."
              onConfirm={async (code) => {
                engageInteractive();
                if (emailVerifyPurpose === "setup" && emailRegPassword.length < 8) {
                  return { ok: false as const, message: "Пароль — не менее 8 символов." };
                }
                const confirmEmailResult = await fetchJsonSafe<{
                  ok?: boolean;
                  redirectTo?: string;
                  role?: "client" | "doctor" | "admin";
                  error?: string;
                  message?: string;
                  retryAfterSeconds?: number;
                }>(
                  emailVerifyPurpose === "setup"
                    ? "/api/auth/email-password/setup-code/complete"
                    : "/api/auth/email-password/register/confirm",
                  {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(
                    emailVerifyPurpose === "setup"
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
                if (res.status === 429 || data.error === "too_many_attempts") {
                  return {
                    ok: false as const,
                    message: data.message ?? "",
                    code: "too_many_attempts",
                    retryAfterSeconds: data.retryAfterSeconds,
                  };
                }
                return { ok: false as const, message: data.message ?? "Ошибка" };
              }}
              onResend={async () => {
                const email = emailLoginEmail.trim();
                const password = emailRegPassword;
                if (!email || !password) {
                  return { kind: "error" as const, message: "Нет данных для повторной отправки" };
                }
                const resendRegisterResult = await fetchJsonSafe<{
                  ok?: boolean;
                  challengeId?: string;
                  retryAfterSeconds?: number;
                  error?: string;
                  message?: string;
                }>(
                  emailVerifyPurpose === "setup"
                    ? "/api/auth/email-password/setup-access"
                    : "/api/auth/email-password/register",
                  {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(
                    emailVerifyPurpose === "setup"
                      ? { email }
                      : {
                          email,
                          password,
                          displayName: emailRegDisplayName.trim() || undefined,
                        },
                  ),
                  },
                );
                if (!resendRegisterResult.ok) {
                  return { kind: "error" as const, message: AUTH_NETWORK_ERROR_MESSAGE };
                }
                const { response: res, data } = resendRegisterResult;
                if (data.ok && data.challengeId) {
                  setEmailRegChallengeId(data.challengeId);
                  setEmailRegRetrySec(data.retryAfterSeconds ?? 60);
                  if (emailVerifyPurpose === "registration") {
                    saveRegisterVerifyPending({
                      email,
                      challengeId: data.challengeId,
                      retryAfterSeconds: data.retryAfterSeconds ?? 60,
                      displayName: emailRegDisplayName.trim() || email.split("@")[0] || "Пациент",
                    });
                  }
                  return { kind: "ok" as const };
                }
                if (res.status === 429 || data.error === "rate_limited") {
                  const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
                  setEmailRegRetrySec(sec);
                  return { kind: "rate_limited" as const, retryAfterSeconds: sec };
                }
                return { kind: "error" as const, message: data.message ?? "Не удалось отправить код" };
              }}
              hideBack
            />
            <div className="mt-3 flex flex-col gap-2">
              <p className={cn(patientMutedTextClass, "break-all text-sm")}>
                Код отправлен на {emailLoginEmail.trim()}
              </p>
              <button
                type="button"
                className={authLinkButtonClass}
                disabled={loading}
                onClick={() => {
                  clearAuthFlowPending();
                  setEmailRegChallengeId(null);
                  setEmailVerifyPurpose("registration");
                  setEmailAuthMode("register");
                }}
              >
                Изменить email
              </button>
              <div className="flex flex-col gap-1 pt-2">
                <label htmlFor="auth-verify-resend-pwd" className={authFormFieldLabelClass}>
                  {emailVerifyPurpose === "setup" ? "Пароль" : "Пароль (для повторной отправки кода)"}
                </label>
                <Input
                  id="auth-verify-resend-pwd"
                  type="password"
                  autoComplete="new-password"
                  value={emailRegPassword}
                  onChange={(e) => setEmailRegPassword(e.target.value)}
                  disabled={loading}
                  className={authEmailInputClass}
                />
              </div>
            </div>
          </div>
        ) : null}
          </>
        )}
      </div>
    );
  }

  if (step === "oauth_first") {
    return (
      <div id="auth-flow-v2-oauth-first" className={cn(authFlowShellClass, "items-center text-center")}>
        <div className="flex w-full flex-col items-center gap-3">
          {oauthProviders.yandex ? (
            <Button
              type="button"
              variant="outline"
              className={AUTH_LOGIN_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void startOauth("yandex")}
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
              onClick={() => void startOauth("google")}
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
              onClick={() => void startOauth("apple")}
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
          onClick={() => openEmailPasswordLogin("oauth_first")}
        >
          Войти по email
        </Button>
        <button
          type="button"
          className={authLinkButtonClass}
          disabled={loading}
          onClick={() => setStep("phone_login")}
        >
          Войти по номеру телефона
        </button>
      </div>
    );
  }

  if (step === "phone_login") {
    return (
      <div id="auth-flow-v2-phone-login" className={authFlowShellClass}>
        <PhoneMessengerAuthFlow
          purpose="login"
          onBack={() => setStep("oauth_first")}
          supportContactHref={supportContactHref}
          nextParam={nextParam}
        />
      </div>
    );
  }

  if (step === "phone") {
    const showPhoneSmsNotice = !isMessengerMiniAppHost();
    const showPhoneBack = !isMessengerMiniAppHost();

    return (
      <div id="auth-flow-v2-phone" className={cn(authFlowShellClass, "items-center text-center")}>
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
          <p className={cn(authStepMutedParagraphClass, "text-center")}>
            Подтверждение телефона по SMS временно недоступно. Вы можете войти или зарегистрироваться с номером
            телефона при помощи мессенджеров Telegram или Макс.
          </p>
        ) : null}
        <InternationalPhoneInput disabled={loading} onSubmit={runCheckPhone} submitLabel="Продолжить" />
      </div>
    );
  }

  if (step === "new_user_foreign" && methods) {
    return (
      <div id="auth-flow-v2-new-user-foreign" className={cn(authFlowShellClass, "text-left")}>
        <p className={authStepMutedParagraphClass}>
          В Mini App код приходит только в привязанный чат Telegram или Max. SMS отключён. Привязать бота можно в
          профиле после входа на сайте по email или OAuth.
        </p>
        {hasWebOauthAlternatives ? (
          <div className="flex w-full flex-col items-center gap-2">
            {oauthProviders.yandex ? (
              <Button
                type="button"
                variant="outline"
                className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                disabled={loading}
                onClick={() => void startOauth("yandex")}
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
                onClick={() => void startOauth("google")}
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
                onClick={() => void startOauth("apple")}
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

  if (step === "foreign_no_otp_channel" && methods) {
    return (
      <div id="auth-flow-v2-foreign-no-otp" className={cn(authFlowShellClass, "text-left")}>
        <p className={authStepMutedParagraphClass}>
          Для этого номера нет привязанного способа доставить код в Mini App. Откройте сайт и войдите по email или
          OAuth — затем привяжите бота в профиле.
        </p>
        {hasWebOauthAlternatives ? (
          <div className="flex w-full flex-col items-center gap-2">
            {oauthProviders.yandex ? (
              <Button
                type="button"
                variant="outline"
                className={AUTH_LOGIN_OUTLINE_BUTTON_CLASS}
                disabled={loading}
                onClick={() => void startOauth("yandex")}
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
                onClick={() => void startOauth("google")}
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
                onClick={() => void startOauth("apple")}
              >
                Apple
              </Button>
            ) : null}
          </div>
        ) : null}
        {supportContactHref ? (
          <SupportContactLink
            href={supportContactHref}
            className={cn(AUTH_LOGIN_PRIMARY_BUTTON_CLASS, "inline-flex items-center justify-center")}
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

  if (step === "choose_channel" && methods) {
    return (
      <div id="auth-flow-v2-channel" className={cn(authFlowShellClass, "text-left")}>
        {smsStartCooldownSec > 0 ? (
          <p className={patientMutedTextClass} role="status">
            Повторная отправка возможна через {smsStartCooldownSec} сек
          </p>
        ) : null}
        <ChannelPicker methods={methods} disabled={loading} onChoose={(ch) => void startPhoneOtp(ch, "channel")} />
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

  if (step === "code" && challengeId && methods) {
    const alternatives = buildAlternatives(methods, otpChannel, (ch) => startPhoneOtp(ch, "channel"));

    return (
      <div id="auth-flow-v2-code" className={cn(authFlowShellClass, "text-left")}>
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
              role?: "client" | "doctor" | "admin";
              message?: string;
              error?: string;
              retryAfterSeconds?: number;
            }>("/api/auth/phone/confirm", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                challengeId,
                code,
                channel: "web",
                chatId,
                browserCalendarIana: getBrowserCalendarIanaForAuth(),
              }),
            });
            if (!confirmPhoneResult.ok) {
              return { ok: false as const, message: AUTH_NETWORK_ERROR_MESSAGE };
            }
            const { data } = confirmPhoneResult;
            if (data.ok && data.redirectTo) {
              redirectOk(data.redirectTo, data.role);
              return { ok: true as const, redirectTo: data.redirectTo };
            }
            if (data.error === "rate_limited" && data.retryAfterSeconds != null) {
              return {
                ok: false as const,
                message: data.message ?? "",
                code: "rate_limited",
                retryAfterSeconds: data.retryAfterSeconds,
              };
            }
            if (data.error === "server_error") {
              return {
                ok: false as const,
                message: data.message ?? "Не удалось завершить вход. Повторите ввод того же кода.",
                code: "server_error",
              };
            }
            return { ok: false as const, message: data.message ?? "Ошибка входа" };
          }}
          onResend={async () => {
            if (!phone) return { kind: "error" as const, message: "Нет номера" };
            if (otpChannel === "sms") {
              return { kind: "error" as const, message: SMS_DISABLED_WEB_MESSAGE };
            }
            const chatId = getWebChatId();
            const resendOtpResult = await fetchJsonSafe<{
              ok?: boolean;
              challengeId?: string;
              retryAfterSeconds?: number;
              error?: string;
              message?: string;
            }>("/api/auth/phone/start", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                phone,
                channel: "web",
                chatId,
                deliveryChannel: otpChannel,
              }),
            });
            if (!resendOtpResult.ok) {
              return { kind: "error" as const, message: AUTH_NETWORK_ERROR_MESSAGE };
            }
            const { response: res, data } = resendOtpResult;
            if (data.ok && data.challengeId) {
              setChallengeId(data.challengeId);
              setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
              return { kind: "ok" as const };
            }
            if (res.status === 429 || data.error === "rate_limited") {
              const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
              setRetryAfterSeconds(sec);
              return { kind: "rate_limited" as const, retryAfterSeconds: sec };
            }
            return { kind: "error" as const, message: data.message ?? "Не удалось отправить код" };
          }}
          onBack={() => {
            if (exists || hasPublicWebOtpChannel(methods)) {
              setStep("choose_channel");
            } else {
              setStep("new_user_foreign");
            }
          }}
        />
      </div>
    );
  }

  return null;
}
