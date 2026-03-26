"use client";

/**
 * Поток входа v2: телефон → check-phone → PIN (если есть) → выбор канала → код.
 * Включается только при NEXT_PUBLIC_AUTH_V2=1 (см. AuthBootstrap).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import type { AuthMethodsPayload } from "@/modules/auth/checkPhoneMethods";
import { isSafeNext } from "@/modules/auth/redirectPolicy";
import { ChannelPicker } from "@/shared/ui/auth/ChannelPicker";
import { PhoneInput } from "@/shared/ui/auth/PhoneInput";
import { PinInput } from "@/shared/ui/auth/PinInput";
import { SmsCodeForm } from "@/shared/ui/auth/SmsCodeForm";
import type { OtpResendOutcome } from "@/shared/ui/auth/OtpCodeForm";

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

type Step = "phone" | "new_user_sms" | "pin" | "choose_channel" | "code";

type OtpChannel = "sms" | "telegram" | "max" | "email";

function otpDescription(channel: OtpChannel): string {
  switch (channel) {
    case "telegram":
      return "Код отправлен в Telegram. Введите его ниже.";
    case "max":
      return "Код отправлен в Max. Введите его ниже.";
    case "email":
      return "Код отправлен на email. Введите его ниже.";
    default:
      return "Код отправлен по SMS. Введите его ниже.";
  }
}

type AuthFlowV2Props = {
  nextParam: string | null;
};

export function AuthFlowV2({ nextParam }: AuthFlowV2Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [methods, setMethods] = useState<AuthMethodsPayload | null>(null);
  const [exists, setExists] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
  const [smsStartCooldownSec, setSmsStartCooldownSec] = useState(0);
  const [otpChannel, setOtpChannel] = useState<OtpChannel>("sms");
  const [otpEntrySource, setOtpEntrySource] = useState<"registration" | "channel" | null>(null);
  const [pinFailCount, setPinFailCount] = useState(0);

  useEffect(() => {
    if (smsStartCooldownSec <= 0) return;
    const t = window.setTimeout(() => setSmsStartCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [smsStartCooldownSec]);

  const redirectOk = (redirectTo: string) => {
    const target = isSafeNext(nextParam) ? nextParam! : redirectTo;
    router.replace(target);
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
      };
      if (!res.ok || !data.ok || !data.methods) {
        toast.error("Не удалось проверить номер");
        return;
      }
      setPhone(normalized);
      setExists(Boolean(data.exists));
      setMethods(data.methods);
      setPinFailCount(0);
      if (!data.exists) {
        setStep("new_user_sms");
      } else if (data.methods.pin) {
        setStep("pin");
      } else {
        setStep("choose_channel");
      }
    } finally {
      setLoading(false);
    }
  };

  const startPhoneOtp = async (
    deliveryChannel: OtpChannel,
    entry: "registration" | "channel"
  ): Promise<OtpResendOutcome> => {
    if (!phone) return { kind: "error", message: "Нет номера телефона" };
    setLoading(true);
    try {
      const chatId = getWebChatId();
      const res = await fetch("/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, channel: "web", chatId, deliveryChannel }),
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

  const submitPin = async (pin: string) => {
    if (!phone) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/pin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, pin }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirectTo?: string;
        message?: string;
        lockedUntil?: string;
        attemptsLeft?: number;
      };
      if (res.status === 423) {
        toast.error("Вход временно заблокирован. Попробуйте позже или войдите по SMS.");
        return;
      }
      if (!res.ok || !data.ok || !data.redirectTo) {
        const nextFails = pinFailCount + 1;
        setPinFailCount(nextFails);
        if (nextFails >= 3) {
          setPinFailCount(0);
          setStep("choose_channel");
          toast.error("Неверный PIN. Выберите другой способ входа.");
          return;
        }
        const hint =
          data.attemptsLeft != null && data.attemptsLeft > 0
            ? ` Осталось попыток: ${data.attemptsLeft}.`
            : "";
        toast.error((data.message ?? "Неверный номер или PIN") + hint);
        return;
      }
      redirectOk(data.redirectTo);
    } finally {
      setLoading(false);
    }
  };

  const goChooseChannel = () => {
    setPinFailCount(0);
    setStep("choose_channel");
  };

  if (step === "phone") {
    return (
      <div id="auth-flow-v2-phone" className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Вход</p>
        <p className="text-muted-foreground text-sm">
          Для входа или регистрации в приложении укажите номер телефона
        </p>
        <PhoneInput disabled={loading} onSubmit={runCheckPhone} submitLabel="Продолжить" />
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
            setSmsStartCooldownSec(0);
            setStep("phone");
            setPhone(null);
            setMethods(null);
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
            setSmsStartCooldownSec(0);
            setStep("phone");
            setPhone(null);
            setMethods(null);
          }}
        >
          Другой номер
        </Button>
      </div>
    );
  }

  if (step === "pin" && phone) {
    return (
      <div id="auth-flow-v2-pin" className="flex flex-col gap-2">
        {smsStartCooldownSec > 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            Повторная отправка возможна через {smsStartCooldownSec} сек
          </p>
        ) : null}
        <PinInput
          disabled={loading}
          onSubmit={(pin) => void submitPin(pin)}
          onForgot={goChooseChannel}
        />
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 px-0 py-0 text-sm font-normal"
          onClick={() => {
            setSmsStartCooldownSec(0);
            setStep("phone");
            setPhone(null);
            setMethods(null);
          }}
        >
          Другой номер
        </Button>
      </div>
    );
  }

  if (step === "code" && challengeId) {
    const showSmsFallback = otpChannel !== "sms";
    return (
      <div id="auth-flow-v2-code" className="flex flex-col gap-3">
        <SmsCodeForm
          challengeId={challengeId}
          retryAfterSeconds={retryAfterSeconds}
          description={otpDescription(otpChannel)}
          smsFallbackLink={showSmsFallback}
          onRequestSms={async () => startPhoneOtp("sms", otpEntrySource ?? "channel")}
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
            if (otpEntrySource === "registration") setStep("new_user_sms");
            else if (otpEntrySource === "channel") setStep("choose_channel");
            else if (exists) setStep("choose_channel");
            else setStep("new_user_sms");
          }}
        />
      </div>
    );
  }

  return null;
}
