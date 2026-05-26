"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AuthMethodsPayload } from "@/modules/auth/checkPhoneMethods";
import {
  pickOtpChannelWithPreferencePublic,
  type OtpUiChannel,
} from "@/modules/auth/otpChannelUi";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { markFreshLoginAfterAuth } from "@/shared/lib/webPush/freshLoginStorage";
import { finishChannelLinkNavigation } from "@/shared/lib/telegramChannelLinkOpen";
import { getBrowserCalendarIanaForAuth } from "@/shared/lib/browserCalendarIana";
import { InternationalPhoneInput } from "@/shared/ui/auth/InternationalPhoneInput";
import { OtpCodeForm, type OtpResendOutcome } from "@/shared/ui/auth/OtpCodeForm";
import {
  AUTH_LOGIN_ACCENT_TEXT_CLASS,
  AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS,
} from "@/shared/ui/auth/loginChrome";
import { patientInlineLinkClass, patientMutedTextClass } from "@/shared/ui/patientVisual";

const WEB_CHAT_ID_KEY = "bersoncare_web_chat_id";
const POLL_MS = 2500;

function getWebChatId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(WEB_CHAT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(WEB_CHAT_ID_KEY, id);
  }
  return id;
}

function hasMessengerBinding(methods: AuthMethodsPayload): boolean {
  return Boolean(methods.telegram || methods.max);
}

function messengerOtpDescription(channel: "telegram" | "max"): string {
  return channel === "telegram"
    ? "Введите код, отправленный вам в Telegram."
    : "Введите код, отправленный вам в Max.";
}

export type PhoneMessengerAuthFlowProps = {
  purpose: "login" | "profile_bind";
  onBack: () => void;
  supportContactHref?: string;
  /** Для login: безопасный next из URL `/app`. */
  nextParam?: string | null;
  /** После успешного подтверждения в профиле (без полного redirect login). */
  onProfileComplete?: () => void;
  title?: string;
  /** Скрыть «Назад» на шаге ввода номера (bind-phone из профиля — назад только в AppShell). */
  hideBackOnPhoneStep?: boolean;
};

type FlowStep = "phone" | "messenger_pick" | "code";

export function PhoneMessengerAuthFlow({
  purpose,
  onBack,
  supportContactHref,
  nextParam = null,
  onProfileComplete,
  title = "Вход по номеру",
  hideBackOnPhoneStep = false,
}: PhoneMessengerAuthFlowProps) {
  const [step, setStep] = useState<FlowStep>("phone");
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [methods, setMethods] = useState<AuthMethodsPayload | null>(null);
  const [exists, setExists] = useState(false);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [bindChannel, setBindChannel] = useState<"telegram" | "max" | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
  const [otpChannel, setOtpChannel] = useState<"telegram" | "max">("telegram");
  const [finishingLogin, setFinishingLogin] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishingRef = useRef(false);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const resetBindAttempt = useCallback(() => {
    clearPoll();
    finishingRef.current = false;
    setFinishingLogin(false);
    setSetupToken(null);
    setBindChannel(null);
    setChallengeId(null);
    setStep("messenger_pick");
  }, [clearPoll]);

  const redirectOk = useCallback(
    (redirectTo: string, role?: "client" | "doctor" | "admin") => {
      markFreshLoginAfterAuth();
      const target = getPostAuthRedirectTarget(role ?? "client", nextParam, redirectTo);
      window.location.assign(target);
    },
    [nextParam],
  );

  const finishMessengerLogin = useCallback(
    async (token: string) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setFinishingLogin(true);
      let succeeded = false;
      try {
        const res = await fetch("/api/auth/phone/messenger-bind/finish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            setupToken: token,
            browserCalendarIana: getBrowserCalendarIanaForAuth(),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          redirectTo?: string;
          role?: "client" | "doctor" | "admin";
          message?: string;
          error?: string;
        };
        if (data.ok && data.redirectTo) {
          clearPoll();
          redirectOk(data.redirectTo, data.role);
          succeeded = true;
          return;
        }
        toast.error(data.message ?? "Не удалось завершить вход");
        resetBindAttempt();
      } finally {
        if (!succeeded) {
          finishingRef.current = false;
          setFinishingLogin(false);
        }
      }
    },
    [clearPoll, resetBindAttempt, redirectOk],
  );

  const pollBindStatus = useCallback(
    async (token: string, _channel: "telegram" | "max") => {
      const statusRes = await fetch("/api/auth/phone/messenger-bind/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: token }),
      });
      const statusData = (await statusRes.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        challengeId?: string;
        retryAfterSeconds?: number;
        error?: string;
      };
      if (!statusRes.ok || !statusData.ok) return;
      if (statusData.status === "consumed") {
        clearPoll();
        if (purpose === "profile_bind") {
          onProfileComplete?.();
        } else {
          void finishMessengerLogin(token);
        }
        return;
      }
      if (statusData.status === "otp_ready" && statusData.challengeId) {
        clearPoll();
        if (purpose === "profile_bind") {
          onProfileComplete?.();
          return;
        }
        void finishMessengerLogin(token);
        return;
      }
      if (statusData.status === "failed") {
        clearPoll();
        toast.error("Не удалось подтвердить номер в мессенджере");
        resetBindAttempt();
      }
      if (statusData.status === "expired") {
        clearPoll();
        toast.error("Время привязки истекло. Начните снова.");
        resetBindAttempt();
      }
    },
    [clearPoll, resetBindAttempt, purpose, onProfileComplete, finishMessengerLogin],
  );

  useEffect(() => () => clearPoll(), [clearPoll]);

  const startPhoneOtp = async (
    normalized: string,
    deliveryChannel: "telegram" | "max",
  ): Promise<boolean> => {
    setLoading(true);
    try {
      const chatId = getWebChatId();
      const res = await fetch("/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: normalized, channel: "web", chatId, deliveryChannel }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        challengeId?: string;
        retryAfterSeconds?: number;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.challengeId) {
        if (data.error === "channel_unavailable") {
          setPhone(normalized);
          setStep("messenger_pick");
          return false;
        }
        toast.error(data.message ?? "Не удалось отправить код");
        return false;
      }
      setPhone(normalized);
      setChallengeId(data.challengeId);
      setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
      setOtpChannel(deliveryChannel);
      setStep("code");
      return true;
    } finally {
      setLoading(false);
    }
  };

  const runCheckPhone = async (normalized: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/check-phone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        exists?: boolean;
        methods?: AuthMethodsPayload;
        preferredOtpChannel?: OtpUiChannel | null;
      };
      if (!res.ok || !data.ok || !data.methods) {
        toast.error("Не удалось проверить номер");
        return;
      }
      setPhone(normalized);
      setExists(Boolean(data.exists));
      setMethods(data.methods);

      if (hasMessengerBinding(data.methods)) {
        const primary = pickOtpChannelWithPreferencePublic(data.methods, data.preferredOtpChannel);
        const ch =
          primary === "telegram" || primary === "max"
            ? primary
            : data.methods.telegram
              ? "telegram"
              : "max";
        const ok = await startPhoneOtp(normalized, ch);
        if (!ok) {
          setStep("messenger_pick");
        }
      } else {
        setStep("messenger_pick");
      }
    } finally {
      setLoading(false);
    }
  };

  const startMessengerBind = async (channelCode: "telegram" | "max") => {
    if (!phone) return;
    setLoading(true);
    clearPoll();
    try {
      const res = await fetch("/api/auth/phone/messenger-bind/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, channelCode, purpose }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        setupToken?: string;
        url?: string;
        manualCommand?: string;
        message?: string;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (res.status === 429 || data.error === "rate_limited") {
        toast.error(
          data.message ??
            (data.retryAfterSeconds != null
              ? `Повторите через ${Math.ceil(data.retryAfterSeconds / 60)} мин.`
              : "Слишком много запросов. Попробуйте позже."),
        );
        return;
      }
      if (!res.ok || !data.ok || !data.setupToken || !data.url) {
        toast.error(data.message ?? "Не удалось начать привязку");
        return;
      }
      const bindToken = data.setupToken;
      setSetupToken(bindToken);
      setBindChannel(channelCode);
      finishChannelLinkNavigation({
        blankWin: null,
        url: data.url,
        channel: channelCode,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      });
      if (channelCode === "max" && data.manualCommand) {
        try {
          await navigator.clipboard.writeText(data.manualCommand);
          toast.success("Команда скопирована — вставьте её в чат с ботом в Max");
        } catch {
          toast("Скопируйте команду вручную в чат с ботом в Max");
        }
      }
      setStep("code");

      void pollBindStatus(bindToken, channelCode);
      pollRef.current = setInterval(() => {
        void pollBindStatus(bindToken, channelCode);
      }, POLL_MS);
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async (): Promise<OtpResendOutcome> => {
    if (!phone || !challengeId) return { kind: "error", message: "Нет данных для повторной отправки" };
    if (setupToken && bindChannel) {
      const statusRes = await fetch("/api/auth/phone/messenger-bind/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken }),
      });
      const statusData = (await statusRes.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        challengeId?: string;
        retryAfterSeconds?: number;
      };
      if (statusData.ok && statusData.status === "otp_ready" && statusData.challengeId) {
        setChallengeId(statusData.challengeId);
        setRetryAfterSeconds(statusData.retryAfterSeconds ?? 60);
        return { kind: "ok" };
      }
    }
    return startPhoneOtp(phone, otpChannel).then((ok) =>
      ok ? { kind: "ok" as const } : { kind: "error" as const, message: "Не удалось отправить код" },
    );
  };

  if (step === "phone") {
    return (
      <div id="phone-messenger-auth-phone" className="flex w-full flex-col gap-3 text-left">
        {!hideBackOnPhoneStep ? (
          <Button type="button" variant="link" className={patientInlineLinkClass} disabled={loading} onClick={onBack}>
            Назад
          </Button>
        ) : null}
        <h2 className="text-center text-lg font-semibold text-[var(--patient-text-primary)]">{title}</h2>
        <InternationalPhoneInput disabled={loading} onSubmit={runCheckPhone} submitLabel="Продолжить" />
      </div>
    );
  }

  if (step === "messenger_pick") {
    return (
      <div id="phone-messenger-auth-pick" className="flex w-full flex-col gap-3 text-left">
        <Button
          type="button"
          variant="link"
          className={patientInlineLinkClass}
          disabled={loading}
          onClick={() => {
            clearPoll();
            setStep("phone");
          }}
        >
          Назад
        </Button>
        <p className={patientMutedTextClass}>
          Для {purpose === "login" ? "входа" : "привязки"} по номеру телефона выберите удобный мессенджер
        </p>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
            disabled={loading}
            onClick={() => void startMessengerBind("telegram")}
          >
            Telegram
          </Button>
          <Button
            type="button"
            variant="outline"
            className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
            disabled={loading}
            onClick={() => void startMessengerBind("max")}
          >
            Max
          </Button>
        </div>
      </div>
    );
  }

  if (step === "code") {
    const waitingForBot = setupToken != null && challengeId == null && purpose === "login";
    const waitingDescription = finishingLogin
      ? "Завершаем вход…"
      : purpose === "profile_bind"
        ? `Подтвердите номер в ${bindChannel === "max" ? "Max" : "Telegram"}. После этого можно вернуться в приложение.`
        : `Подтвердите номер в ${bindChannel === "max" ? "Max" : "Telegram"}.`;
    return (
      <div id="phone-messenger-auth-code" className="flex w-full flex-col gap-3 text-left">
        {waitingForBot ? (
          <>
            <p className={patientMutedTextClass}>{waitingDescription}</p>
            <Button type="button" variant="link" className={patientInlineLinkClass} onClick={resetBindAttempt}>
              Начать снова
            </Button>
          </>
        ) : null}
        {challengeId ? (
          <OtpCodeForm
            challengeId={challengeId}
            retryAfterSeconds={retryAfterSeconds}
            supportContactHref={supportContactHref}
            submitLabel={purpose === "login" ? "Войти" : "Подтвердить"}
            description={messengerOtpDescription(otpChannel)}
            onConfirm={async (code) => {
              const chatId = getWebChatId();
              const res = await fetch("/api/auth/phone/confirm", {
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
              const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                redirectTo?: string;
                role?: "client" | "doctor" | "admin";
                message?: string;
                error?: string;
                retryAfterSeconds?: number;
              };
              if (data.ok) {
                clearPoll();
                if (purpose === "profile_bind") {
                  onProfileComplete?.();
                  return { ok: true as const };
                }
                if (data.redirectTo) {
                  redirectOk(data.redirectTo, data.role);
                  return { ok: true as const, redirectTo: data.redirectTo };
                }
                return { ok: true as const };
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
              return { ok: false as const, message: data.message ?? "Ошибка" };
            }}
            onResend={resendOtp}
            onBack={() => {
              clearPoll();
              if (methods && hasMessengerBinding(methods) && exists) {
                setStep("messenger_pick");
              } else if (setupToken) {
                setStep("messenger_pick");
              } else {
                setStep("phone");
              }
              setChallengeId(null);
            }}
            hideBack={waitingForBot}
          />
        ) : (
          <p className={cn(patientMutedTextClass, "text-center")}>Ожидание подтверждения в мессенджере…</p>
        )}
        {!waitingForBot ? (
          <button
            type="button"
            className={cn(
              "border-none bg-transparent text-sm font-medium underline-offset-2",
              patientInlineLinkClass,
              AUTH_LOGIN_ACCENT_TEXT_CLASS,
            )}
            disabled={loading}
            onClick={() => {
              clearPoll();
              setStep("messenger_pick");
              setChallengeId(null);
            }}
          >
            Другой мессенджер
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}
