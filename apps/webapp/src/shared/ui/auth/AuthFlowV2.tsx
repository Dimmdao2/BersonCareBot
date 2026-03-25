"use client";

/**
 * Поток входа v2: телефон → check-phone → выбор метода → PIN / SMS / Telegram / OAuth.
 * Включается только при NEXT_PUBLIC_AUTH_V2=1 (см. AuthBootstrap).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isSafeNext } from "@/modules/auth/redirectPolicy";
import { PhoneInput } from "@/shared/ui/auth/PhoneInput";
import { MethodPicker, type MethodPickerMethods } from "@/shared/ui/auth/MethodPicker";
import { PinInput } from "@/shared/ui/auth/PinInput";
import { SmsCodeForm } from "@/shared/ui/auth/SmsCodeForm";

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

type Step =
  | "phone"
  | "methods"
  | "pin"
  | "code"
  | "new_user_sms"
  | "messenger_wait";

type AuthFlowV2Props = {
  nextParam: string | null;
};

export function AuthFlowV2({ nextParam }: AuthFlowV2Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [methods, setMethods] = useState<MethodPickerMethods | null>(null);
  const [exists, setExists] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
  const [messengerToken, setMessengerToken] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);

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
        methods?: MethodPickerMethods;
      };
      if (!res.ok || !data.ok || !data.methods) {
        toast.error("Не удалось проверить номер");
        return;
      }
      setPhone(normalized);
      setExists(Boolean(data.exists));
      setMethods(data.methods);
      if (!data.exists) {
        setStep("new_user_sms");
      } else {
        setStep("methods");
      }
    } finally {
      setLoading(false);
    }
  };

  const startSms = async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const chatId = getWebChatId();
      const res = await fetch("/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, channel: "web", chatId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        challengeId?: string;
        retryAfterSeconds?: number;
        message?: string;
      };
      if (!res.ok || !data.ok || !data.challengeId) {
        toast.error(data.message ?? "Не удалось отправить код");
        return;
      }
      setChallengeId(data.challengeId);
      setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
      setStep("code");
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

  const startMessenger = async (method: "telegram" | "max") => {
    if (!phone) return;
    if (method === "max") {
      toast("Вход через Max скоро будет доступен", { icon: "ℹ️" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/messenger/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, method }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        token?: string;
        deepLink?: string | null;
        message?: string;
      };
      if (!res.ok || !data.ok || !data.token) {
        toast.error(data.message ?? "Не удалось создать ссылку");
        return;
      }
      setMessengerToken(data.token);
      setDeepLink(data.deepLink ?? null);
      setStep("messenger_wait");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step !== "messenger_wait" || !messengerToken) return;
    const ac = new AbortController();
    const id = window.setInterval(async () => {
      try {
        const pollRes = await fetch("/api/auth/messenger/poll", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: messengerToken }),
          signal: ac.signal,
        });
        const pollData = (await pollRes.json().catch(() => ({}))) as {
          ok?: boolean;
          status?: string;
          redirectTo?: string;
        };
        if (pollRes.ok && pollData.ok && pollData.status === "confirmed" && pollData.redirectTo) {
          window.clearInterval(id);
          const target = isSafeNext(nextParam) ? nextParam! : pollData.redirectTo;
          router.replace(target);
        }
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => {
      ac.abort();
      window.clearInterval(id);
    };
  }, [step, messengerToken, nextParam, router]);

  const onMethod = (m: "pin" | "sms" | "telegram" | "max" | "oauth_yandex") => {
    if (m === "pin") setStep("pin");
    else if (m === "sms") void startSms();
    else if (m === "telegram") void startMessenger("telegram");
    else if (m === "max") void startMessenger("max");
  };

  if (step === "phone") {
    return (
      <div id="auth-flow-v2-phone" className="flex flex-col gap-3">
        <p className="eyebrow">Вход</p>
        <PhoneInput disabled={loading} onSubmit={runCheckPhone} submitLabel="Продолжить" />
      </div>
    );
  }

  if (step === "new_user_sms" && methods) {
    return (
      <div id="auth-flow-v2-new-user" className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">Номер не найден. Получите код по SMS для регистрации.</p>
        <Button type="button" disabled={loading} onClick={() => void startSms()}>
          Получить код по SMS
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 px-0 py-0 text-sm font-normal"
          onClick={() => {
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

  if (step === "methods" && methods) {
    return (
      <div id="auth-flow-v2-methods" className="flex flex-col gap-3">
        <MethodPicker methods={methods} disabled={loading} onChoose={onMethod} />
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 px-0 py-0 text-sm font-normal"
          onClick={() => {
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
        <PinInput
          disabled={loading}
          onSubmit={(pin) => void submitPin(pin)}
          onForgotSms={() => void startSms()}
        />
      </div>
    );
  }

  if (step === "code" && challengeId) {
    return (
      <div id="auth-flow-v2-code" className="flex flex-col gap-3">
        <SmsCodeForm
          challengeId={challengeId}
          retryAfterSeconds={retryAfterSeconds}
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
            };
            if (data.ok && data.redirectTo) {
              redirectOk(data.redirectTo);
              return { ok: true as const, redirectTo: data.redirectTo };
            }
            return { ok: false as const, message: data.message ?? "Ошибка входа" };
          }}
          onResend={async () => {
            if (!phone) return;
            const chatId = getWebChatId();
            const res = await fetch("/api/auth/phone/start", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ phone, channel: "web", chatId }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              challengeId?: string;
              retryAfterSeconds?: number;
            };
            if (data.ok && data.challengeId) {
              setChallengeId(data.challengeId);
              setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
            }
          }}
          onBack={() => {
            if (exists) setStep("methods");
            else setStep("new_user_sms");
          }}
        />
      </div>
    );
  }

  if (step === "messenger_wait" && messengerToken) {
    return (
      <div id="auth-flow-v2-messenger" className="flex flex-col gap-2">
        <p className="eyebrow">Подтвердите вход в боте</p>
        {deepLink ? (
          <a
            href={deepLink}
            className={cn(buttonVariants({ variant: "default" }), "inline-flex w-fit")}
            target="_blank"
            rel="noreferrer"
          >
            Открыть Telegram
          </a>
        ) : (
          <p className="text-muted-foreground text-sm">Ожидаем подтверждение…</p>
        )}
        <p className="text-muted-foreground text-xs">Окно можно закрыть — проверка продолжается.</p>
      </div>
    );
  }

  return null;
}
