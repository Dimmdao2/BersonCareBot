"use client";

/**
 * Поток входа: телефон → check-phone → PIN (если есть) → авто-отправка OTP по приоритету
 * (Telegram → Max → email → SMS) или выбор канала после ошибки PIN → код → при необходимости установка PIN.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import type { AuthMethodsPayload } from "@/modules/auth/checkPhoneMethods";
import {
  isOtpChannelAvailable,
  OTP_OTHER_CHANNELS_ORDER,
  pickOtpChannelWithPreference,
} from "@/modules/auth/otpChannelUi";
import { routePaths } from "@/app-layer/routes/paths";
import { isSafeNext } from "@/modules/auth/redirectPolicy";
import { ChannelPicker } from "@/shared/ui/auth/ChannelPicker";
import { OtpCodeForm, type OtpAlternativeEntry, type OtpResendOutcome } from "@/shared/ui/auth/OtpCodeForm";
import { PhoneInput } from "@/shared/ui/auth/PhoneInput";
import { PinInput } from "@/shared/ui/auth/PinInput";

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

export type AuthFlowStep = "phone" | "new_user_sms" | "pin" | "choose_channel" | "code" | "set_pin";

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
  for (const ch of OTP_OTHER_CHANNELS_ORDER) {
    if (ch === currentChannel) continue;
    if (!isOtpChannelAvailable(methods, ch)) continue;
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
  /** Сообщает родителю о текущем шаге (плашка на /app только для `phone`). */
  onStepChange?: (step: AuthFlowStep) => void;
};

export function AuthFlowV2({ nextParam, supportContactHref, onStepChange }: AuthFlowV2Props) {
  const router = useRouter();
  const [step, setStep] = useState<AuthFlowStep>("phone");
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [methods, setMethods] = useState<AuthMethodsPayload | null>(null);
  const [exists, setExists] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
  const [smsStartCooldownSec, setSmsStartCooldownSec] = useState(0);
  const [otpChannel, setOtpChannel] = useState<OtpChannel>("sms");
  const [otpEntrySource, setOtpEntrySource] = useState<"registration" | "channel" | "auto" | null>(null);
  const [pinFailCount, setPinFailCount] = useState(0);
  const [pinSetRedirectTo, setPinSetRedirectTo] = useState<string | null>(null);
  const [pinSetFirstPin, setPinSetFirstPin] = useState<string | null>(null);
  /** Remount PinInput after a failed attempt so digits clear and auto-submit cannot re-fire. */
  const [pinLoginResetKey, setPinLoginResetKey] = useState(0);
  const [setPinStep1ResetKey, setSetPinStep1ResetKey] = useState(0);
  const [setPinStep2ResetKey, setSetPinStep2ResetKey] = useState(0);
  const [pinRecoveryAfterExhaustion, setPinRecoveryAfterExhaustion] = useState(false);

  useEffect(() => {
    if (smsStartCooldownSec <= 0) return;
    const t = window.setTimeout(() => setSmsStartCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [smsStartCooldownSec]);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const redirectOk = (redirectTo: string) => {
    const target = isSafeNext(nextParam) ? nextParam! : redirectTo;
    router.replace(target);
  };

  const startPhoneOtp = async (
    deliveryChannel: OtpChannel,
    entry: "registration" | "channel" | "auto",
    /** Сразу после `setPhone` в том же async-тике state ещё stale — передаём нормализованный номер из `runCheckPhone`. */
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
      setPinFailCount(0);
      if (!data.exists) {
        setStep("new_user_sms");
      } else if (data.methods.pin) {
        setStep("pin");
      } else {
        const primary = pickOtpChannelWithPreference(data.methods, data.preferredOtpChannel);
        const outcome = await startPhoneOtp(primary, "auto", normalized);
        if (outcome.kind !== "ok") {
          setStep("choose_channel");
        }
      }
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
        setPinLoginResetKey((k) => k + 1);
        return;
      }
      if (!res.ok || !data.ok || !data.redirectTo) {
        const nextFails = pinFailCount + 1;
        setPinFailCount(nextFails);
        setPinLoginResetKey((k) => k + 1);
        if (nextFails >= 3) {
          setPinFailCount(0);
          if (typeof window !== "undefined") {
            sessionStorage.setItem("bersoncare_pin_recovery", "1");
          }
          setPinRecoveryAfterExhaustion(true);
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
    setPinRecoveryAfterExhaustion(false);
    setStep("choose_channel");
  };

  if (step === "phone") {
    return (
      <div id="auth-flow-v2-phone" className="flex flex-col gap-4 py-3">
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
        {pinRecoveryAfterExhaustion ? (
          <p className="text-muted-foreground text-sm">
            После входа по коду откройте <span className="font-medium text-foreground">Профиль</span> и задайте новый
            PIN в разделе безопасности.
          </p>
        ) : null}
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
      <div id="auth-flow-v2-pin" className="flex flex-col items-center gap-4 py-3">
        {smsStartCooldownSec > 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            Повторная отправка возможна через {smsStartCooldownSec} сек
          </p>
        ) : null}
        <PinInput
          key={`pin-login-${pinLoginResetKey}`}
          disabled={loading}
          onSubmit={(pin) => void submitPin(pin)}
          onForgot={goChooseChannel}
        />
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 self-center px-0 py-0 text-center text-sm font-normal"
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

  if (step === "set_pin" && pinSetRedirectTo) {
    if (!pinSetFirstPin) {
      return (
        <div id="auth-flow-v2-set-pin-1" className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Придумайте PIN-код для быстрого входа без кода подтверждения.
          </p>
          <PinInput
            key={`set-pin-1-${setPinStep1ResetKey}`}
            disabled={loading}
            onSubmit={(pin) => {
              setPinSetFirstPin(pin);
            }}
            onForgot={() => redirectOk(pinSetRedirectTo)}
            forgotLabel="Войти без PIN-кода"
          />
        </div>
      );
    }
    return (
      <div id="auth-flow-v2-set-pin-2" className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">Повторите PIN-код.</p>
        <PinInput
          key={`set-pin-2-${setPinStep2ResetKey}`}
          disabled={loading}
          onSubmit={async (confirmPin) => {
            if (confirmPin !== pinSetFirstPin) {
              toast.error("PIN не совпадает. Введите снова.");
              setPinSetFirstPin(null);
              setSetPinStep1ResetKey((k) => k + 1);
              setSetPinStep2ResetKey((k) => k + 1);
              return;
            }
            setLoading(true);
            try {
              const res = await fetch("/api/auth/pin/set", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ pin: pinSetFirstPin, pinConfirm: confirmPin }),
              });
              if (!res.ok) {
                const d = (await res.json().catch(() => ({}))) as { message?: string };
                toast.error(d.message ?? "Не удалось сохранить PIN");
                return;
              }
              redirectOk(pinSetRedirectTo);
            } finally {
              setLoading(false);
            }
          }}
          onForgot={() => {
            setPinSetFirstPin(null);
          }}
          forgotLabel="Назад"
        />
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
              const fromPinRecovery =
                typeof window !== "undefined" && sessionStorage.getItem("bersoncare_pin_recovery") === "1";
              if (fromPinRecovery) {
                sessionStorage.removeItem("bersoncare_pin_recovery");
                setPinRecoveryAfterExhaustion(false);
                if (data.redirectTo.startsWith("/app/patient")) {
                  router.replace(`${routePaths.profile}#patient-profile-pin`);
                  return { ok: true as const, redirectTo: data.redirectTo };
                }
              }
              if (!methods.pin) {
                setPinSetRedirectTo(data.redirectTo);
                setStep("set_pin");
                return { ok: true as const, redirectTo: data.redirectTo };
              }
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
            else if (otpEntrySource === "channel" || otpEntrySource === "auto") setStep("choose_channel");
            else if (exists) setStep("choose_channel");
            else setStep("new_user_sms");
          }}
        />
      </div>
    );
  }

  return null;
}
