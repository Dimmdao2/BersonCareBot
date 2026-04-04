"use client";

/**
 * Публичный поток входа (web): Telegram Login → телефон → OTP.
 * PIN в этом flow намеренно отключён (Stage 5); см. `docs/AUTH_RESTRUCTURE/auth.md`.
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
import { isSafeNext } from "@/modules/auth/redirectPolicy";
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
  | "landing"
  | "phone"
  | "new_user_foreign"
  | "new_user_sms"
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
      return "Введите код, отправленный вам по SMS.";
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
    if (ch === "sms") {
      result.push({
        label: "Получить код по SMS",
        asText: true,
        onClick: async () => {
          await onChoose("sms");
        },
      });
      continue;
    }
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

export function AuthFlowV2({ nextParam, supportContactHref, onStepChange }: AuthFlowV2Props) {
  const router = useRouter();
  const [step, setStep] = useState<AuthFlowStep>("entry_loading");
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [methods, setMethods] = useState<AuthMethodsPayload | null>(null);
  const [exists, setExists] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
  const [smsStartCooldownSec, setSmsStartCooldownSec] = useState(0);
  const [otpChannel, setOtpChannel] = useState<OtpChannel>("sms");
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
      setStep("phone");
    } else {
      void fetch("/api/auth/telegram-login/config")
        .then((r) => r.json())
        .then((d: { botUsername?: string | null }) => {
          if (cancelled) return;
          const u = typeof d.botUsername === "string" ? d.botUsername.trim() : "";
          if (u.length > 0) {
            setTelegramBotUsername(u);
            setStep("landing");
          } else {
            setTelegramBotUsername(null);
            setStep("phone");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setTelegramBotUsername(null);
            setStep("phone");
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const goBackToEntry = () => {
    setSmsStartCooldownSec(0);
    setStep(telegramBotUsername ? "landing" : "phone");
    setPhone(null);
    setMethods(null);
  };

  const redirectOk = (redirectTo: string) => {
    const target = isSafeNext(nextParam) ? nextParam! : redirectTo;
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
        setStep(data.methods.sms ? "new_user_sms" : "new_user_foreign");
      } else {
        const primary = pickOtpChannelWithPreferencePublic(data.methods, data.preferredOtpChannel);
        if (primary == null) {
          setStep("foreign_no_otp_channel");
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

  if (step === "landing" && telegramBotUsername) {
    return (
      <div id="auth-flow-v2-landing" className="flex flex-col gap-6 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Вход</p>
        <TelegramLoginButton botUsername={telegramBotUsername} nextParam={nextParam} disabled={loading} />
        <p className="text-center text-sm text-muted-foreground">или</p>
        <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={() => setStep("phone")}>
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
          SMS-код доступен только для российских мобильных номеров. Для входа с иностранным номером используйте
          Telegram.
        </p>
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
          Для этого номера в вебе нет способа получить код: SMS — только для номеров РФ. Войдите через Telegram
          {supportContactHref ? " или обратитесь в поддержку." : "."}
        </p>
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

  if (step === "new_user_sms" && methods) {
    return (
      <div id="auth-flow-v2-new-user" className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">Номер не найден. Получите код по SMS для регистрации.</p>
        {smsStartCooldownSec > 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            Повторная отправка возможна через {smsStartCooldownSec} сек
          </p>
        ) : null}
        <Button
          type="button"
          disabled={loading || smsStartCooldownSec > 0}
          onClick={() => void startPhoneOtp("sms", "registration")}
        >
          Получить код по SMS
        </Button>
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

  if (step === "choose_channel" && methods) {
    return (
      <div id="auth-flow-v2-channel" className="flex flex-col gap-3">
        {smsStartCooldownSec > 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            Повторная отправка возможна через {smsStartCooldownSec} сек
          </p>
        ) : null}
        <ChannelPicker
          methods={methods}
          disabled={loading}
          onChoose={(ch) => void startPhoneOtp(ch, "channel")}
          onChooseSms={() => void startPhoneOtp("sms", "channel")}
        />
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
              message?: string;
              error?: string;
              retryAfterSeconds?: number;
            };
            if (data.ok && data.redirectTo) {
              redirectOk(data.redirectTo);
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
            if (otpEntrySource === "registration") {
              setStep(methods.sms ? "new_user_sms" : "new_user_foreign");
            } else if (otpEntrySource === "channel" || otpEntrySource === "auto") setStep("choose_channel");
            else if (exists) setStep("choose_channel");
            else setStep(methods.sms ? "new_user_sms" : "new_user_foreign");
          }}
        />
      </div>
    );
  }

  return null;
}
