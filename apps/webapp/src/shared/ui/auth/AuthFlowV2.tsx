"use client";

/**
 * Публичный поток входа (web): при включённых OAuth — экран OAuth-first; иначе Telegram Login или сразу телефон.
 * OTP в вебе — только Telegram / Max (SMS отключён). PIN в этом flow намеренно отключён (Stage 5).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import type { AuthMethodsPayload } from "@/modules/auth/checkPhoneMethods";
import {
  isOtpChannelAvailablePublic,
  OTP_PUBLIC_OTHER_CHANNELS_ORDER,
  pickOtpChannelWithPreferencePublic,
} from "@/modules/auth/otpChannelUi";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { ChannelPicker } from "@/shared/ui/auth/ChannelPicker";
import { OtpCodeForm, type OtpAlternativeEntry, type OtpResendOutcome } from "@/shared/ui/auth/OtpCodeForm";
import { InternationalPhoneInput } from "@/shared/ui/auth/InternationalPhoneInput";
import { TelegramLoginButton } from "@/shared/ui/auth/TelegramLoginButton";

const WEB_CHAT_ID_KEY = "bersoncare_web_chat_id";

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
  | "landing"
  | "phone"
  | "new_user_foreign"
  | "foreign_no_otp_channel"
  | "choose_channel"
  | "code";

type OtpChannel = "sms" | "telegram" | "max" | "email";

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

type AuthFlowV2Props = {
  nextParam: string | null;
  supportContactHref?: string;
  onStepChange?: (step: AuthFlowStep) => void;
};

type OauthProviderFlags = { yandex: boolean; google: boolean; apple: boolean };

export function AuthFlowV2({ nextParam, supportContactHref, onStepChange }: AuthFlowV2Props) {
  const router = useRouter();
  const [step, setStep] = useState<AuthFlowStep>("entry_loading");
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null);
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

  useEffect(() => {
    if (smsStartCooldownSec <= 0) return;
    const t = window.setTimeout(() => setSmsStartCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [smsStartCooldownSec]);

  useEffect(() => {
    let cancelled = false;
    if (isMessengerMiniAppHost()) {
      setTelegramBotUsername(null);
      setOauthProviders({ yandex: false, google: false, apple: false });
      setStep("phone");
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([
      fetch("/api/auth/telegram-login/config").then((r) => r.json()),
      fetch("/api/auth/oauth/providers").then((r) => r.json()),
    ])
      .then(([tgData, oauthData]) => {
        if (cancelled) return;
        const u = typeof (tgData as { botUsername?: string | null }).botUsername === "string"
          ? String((tgData as { botUsername?: string | null }).botUsername).trim()
          : "";
        setTelegramBotUsername(u.length > 0 ? u : null);

        const d = oauthData as { ok?: boolean; yandex?: boolean; google?: boolean; apple?: boolean };
        const op =
          d?.ok === true
            ? {
                yandex: Boolean(d.yandex),
                google: Boolean(d.google),
                apple: Boolean(d.apple),
              }
            : { yandex: false, google: false, apple: false };
        setOauthProviders(op);

        const oauthOn = op.yandex || op.google || op.apple;
        if (oauthOn) {
          setStep("oauth_first");
        } else if (u.length > 0) {
          setStep("landing");
        } else {
          setStep("phone");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTelegramBotUsername(null);
          setOauthProviders({ yandex: false, google: false, apple: false });
          setStep("phone");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const startOauth = async (provider: "yandex" | "google" | "apple") => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        authUrl?: string;
        message?: string;
        error?: string;
      };
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

  const showOauthRow =
    oauthProviders.yandex || oauthProviders.google || oauthProviders.apple;

  const goBackToEntry = () => {
    setSmsStartCooldownSec(0);
    if (showOauthRow && !isMessengerMiniAppHost()) {
      setStep("oauth_first");
    } else if (telegramBotUsername) {
      setStep("landing");
    } else {
      setStep("phone");
    }
    setPhone(null);
    setMethods(null);
  };

  const redirectOk = (redirectTo: string, role?: "client" | "doctor" | "admin") => {
    const target = getPostAuthRedirectTarget(role ?? "client", nextParam, redirectTo);
    router.replace(target);
  };

  const startPhoneOtp = async (
    deliveryChannel: OtpChannel,
    entry: "registration" | "channel" | "auto",
    phoneForRequest?: string | null,
  ): Promise<OtpResendOutcome> => {
    const effectivePhone = phoneForRequest ?? phone;
    if (!effectivePhone) return { kind: "error", message: "Нет номера телефона" };
    setLoading(true);
    try {
      const chatId = getWebChatId();
      const res = await fetch("/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: effectivePhone, channel: "web", chatId, deliveryChannel }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        challengeId?: string;
        retryAfterSeconds?: number;
        message?: string;
        error?: string;
      };
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
        preferredOtpChannel?: OtpChannel | null;
      };
      if (!res.ok || !data.ok || !data.methods) {
        toast.error("Не удалось проверить номер");
        return;
      }
      setPhone(normalized);
      setExists(Boolean(data.exists));
      setMethods(data.methods);
      if (!data.exists) {
        const hasMessenger =
          isOtpChannelAvailablePublic(data.methods, "telegram") ||
          isOtpChannelAvailablePublic(data.methods, "max");
        setStep(hasMessenger ? "choose_channel" : "new_user_foreign");
      } else {
        const primary = pickOtpChannelWithPreferencePublic(data.methods, data.preferredOtpChannel);
        const hasPublicChannel =
          isOtpChannelAvailablePublic(data.methods, "telegram") ||
          isOtpChannelAvailablePublic(data.methods, "max");
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
      <div id="auth-flow-v2-entry-loading" className="py-6 text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  if (step === "oauth_first") {
    return (
      <div id="auth-flow-v2-oauth-first" className="flex flex-col items-center gap-6 py-3 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Вход</p>
        <p className="text-muted-foreground text-sm max-w-sm">
          Войдите через аккаунт Яндекс, Google или Apple — или укажите номер телефона ниже.
        </p>
        <div className="flex w-full max-w-sm flex-col gap-2">
          {oauthProviders.yandex ? (
            <Button
              type="button"
              variant="default"
              className="w-full"
              disabled={loading}
              onClick={() => void startOauth("yandex")}
            >
              Войти через Яндекс
            </Button>
          ) : null}
          {oauthProviders.google ? (
            <Button
              type="button"
              variant="default"
              className="w-full"
              disabled={loading}
              onClick={() => void startOauth("google")}
            >
              Войти через Google
            </Button>
          ) : null}
          {oauthProviders.apple ? (
            <Button
              type="button"
              variant="default"
              className="w-full"
              disabled={loading}
              onClick={() => void startOauth("apple")}
            >
              Войти через Apple
            </Button>
          ) : null}
        </div>
        {telegramBotUsername ? (
          <>
            <p className="text-center text-sm text-muted-foreground">или</p>
            <TelegramLoginButton botUsername={telegramBotUsername} nextParam={nextParam} disabled={loading} />
          </>
        ) : null}
        <p className="text-center text-sm text-muted-foreground">или</p>
        <Button
          type="button"
          variant="outline"
          className="mx-auto w-full max-w-sm"
          disabled={loading}
          onClick={() => setStep("phone")}
        >
          Войти по номеру телефона
        </Button>
      </div>
    );
  }

  if (step === "landing" && telegramBotUsername) {
    return (
      <div id="auth-flow-v2-landing" className="flex flex-col items-center gap-6 py-3 text-center">
        <TelegramLoginButton botUsername={telegramBotUsername} nextParam={nextParam} disabled={loading} />
        {showOauthRow ? (
          <>
            <p className="text-center text-sm text-muted-foreground">или</p>
            <div className="flex w-full max-w-sm flex-col gap-2">
              {oauthProviders.yandex ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
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
                  className="w-full"
                  disabled={loading}
                  onClick={() => void startOauth("google")}
                >
                  Войти через Google
                </Button>
              ) : null}
              {oauthProviders.apple ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                  onClick={() => void startOauth("apple")}
                >
                  Войти через Apple
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
        <p className="text-center text-sm text-muted-foreground">или</p>
        <Button
          type="button"
          variant="outline"
          className="mx-auto w-full max-w-sm"
          disabled={loading}
          onClick={() => setStep("phone")}
        >
          Войти по номеру телефона
        </Button>
      </div>
    );
  }

  if (step === "phone") {
    return (
      <div id="auth-flow-v2-phone" className="flex flex-col gap-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Вход</p>
        <p className="text-muted-foreground text-sm">
          Для входа или регистрации в приложении укажите номер телефона
        </p>
        {showOauthRow ? (
          <>
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-0 self-start px-0 py-0 text-sm font-normal text-muted-foreground"
              onClick={() => setStep("oauth_first")}
            >
              Другие способы входа
            </Button>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Вход без номера</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {oauthProviders.yandex ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
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
                    size="sm"
                    className="flex-1"
                    disabled={loading}
                    onClick={() => void startOauth("google")}
                  >
                    Google
                  </Button>
                ) : null}
                {oauthProviders.apple ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={loading}
                    onClick={() => void startOauth("apple")}
                  >
                    Apple
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
        <InternationalPhoneInput disabled={loading} onSubmit={runCheckPhone} submitLabel="Продолжить" />
        {telegramBotUsername ? (
          <Button
            type="button"
            variant="link"
            className="h-auto min-h-0 px-0 py-0 text-sm font-normal text-muted-foreground"
            onClick={() => setStep("landing")}
          >
            Войти через Telegram
          </Button>
        ) : null}
      </div>
    );
  }

  if (step === "new_user_foreign" && methods) {
    return (
      <div id="auth-flow-v2-new-user-foreign" className="flex flex-col gap-3 py-3">
        <p className="text-muted-foreground text-sm">
          В браузере код подтверждения отправляется только в Telegram или Max, привязанные к номеру. SMS для входа с сайта
          отключён.
          {showOauthRow
            ? " Войдите через Яндекс, Google или Apple или укажите другой номер."
            : telegramBotUsername
              ? " Воспользуйтесь входом через Telegram ниже."
              : ""}
        </p>
        {showOauthRow ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Вход без номера</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {oauthProviders.yandex ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
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
                  size="sm"
                  className="flex-1"
                  disabled={loading}
                  onClick={() => void startOauth("google")}
                >
                  Google
                </Button>
              ) : null}
              {oauthProviders.apple ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={loading}
                  onClick={() => void startOauth("apple")}
                >
                  Apple
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {telegramBotUsername ? (
          <Button type="button" disabled={loading} onClick={() => setStep("landing")}>
            Войти через Telegram
          </Button>
        ) : null}
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 px-0 py-0 text-sm font-normal"
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
      <div id="auth-flow-v2-foreign-no-otp" className="flex flex-col gap-3 py-3">
        <p className="text-muted-foreground text-sm">
          Для этого номера в браузере нет способа получить код: нужны Telegram или Max, привязанные к аккаунту. SMS для
          входа с сайта отключён.
          {showOauthRow
            ? " Воспользуйтесь входом без номера (Яндекс, Google, Apple) — кнопки ниже."
            : telegramBotUsername
              ? " Войдите через Telegram."
              : ""}
          {supportContactHref ? " При необходимости обратитесь в поддержку." : ""}
        </p>
        {showOauthRow ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Вход без номера</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {oauthProviders.yandex ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
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
                  size="sm"
                  className="flex-1"
                  disabled={loading}
                  onClick={() => void startOauth("google")}
                >
                  Google
                </Button>
              ) : null}
              {oauthProviders.apple ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={loading}
                  onClick={() => void startOauth("apple")}
                >
                  Apple
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {telegramBotUsername ? (
          <Button type="button" disabled={loading} onClick={() => setStep("landing")}>
            Войти через Telegram
          </Button>
        ) : null}
        {supportContactHref ? (
          <a
            href={supportContactHref}
            className={cn(buttonVariants({ variant: "outline" }), "inline-flex w-full justify-center")}
          >
            Связаться с поддержкой
          </a>
        ) : null}
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 px-0 py-0 text-sm font-normal"
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
      <div id="auth-flow-v2-channel" className="flex flex-col gap-3">
        {smsStartCooldownSec > 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            Повторная отправка возможна через {smsStartCooldownSec} сек
          </p>
        ) : null}
        <ChannelPicker methods={methods} disabled={loading} onChoose={(ch) => void startPhoneOtp(ch, "channel")} />
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 px-0 py-0 text-sm font-normal"
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
      <div id="auth-flow-v2-code" className="flex flex-col gap-3">
        <OtpCodeForm
          challengeId={challengeId}
          retryAfterSeconds={retryAfterSeconds}
          supportContactHref={supportContactHref}
          submitLabel="Войти"
          description={otpDescription(otpChannel, methods.emailAddress)}
          alternatives={alternatives}
          onConfirm={async (code) => {
            const chatId = getWebChatId();
            const res = await fetch("/api/auth/phone/confirm", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ challengeId, code, channel: "web", chatId }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              redirectTo?: string;
              role?: "client" | "doctor" | "admin";
              message?: string;
              error?: string;
              retryAfterSeconds?: number;
            };
            if (data.ok && data.redirectTo) {
              redirectOk(data.redirectTo, data.role);
              return { ok: true as const, redirectTo: data.redirectTo };
            }
            if (data.error === "rate_limited" && data.retryAfterSeconds != null) {
              return {
                ok: false as const,
                message: "",
                code: "rate_limited",
                retryAfterSeconds: data.retryAfterSeconds,
              };
            }
            return { ok: false as const, message: data.message ?? "Ошибка входа" };
          }}
          onResend={async () => {
            if (!phone) return { kind: "error" as const, message: "Нет номера" };
            const chatId = getWebChatId();
            const res = await fetch("/api/auth/phone/start", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                phone,
                channel: "web",
                chatId,
                deliveryChannel: otpChannel,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              challengeId?: string;
              retryAfterSeconds?: number;
              error?: string;
              message?: string;
            };
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
            const hasMessenger =
              isOtpChannelAvailablePublic(methods, "telegram") ||
              isOtpChannelAvailablePublic(methods, "max");
            if (exists || hasMessenger) {
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
