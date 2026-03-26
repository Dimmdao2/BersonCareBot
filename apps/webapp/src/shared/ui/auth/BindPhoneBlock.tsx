"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PhoneAuthForm } from "./PhoneAuthForm";
import { SmsCodeForm } from "./SmsCodeForm";

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

type BindPhoneBlockProps = {
  channel: "telegram" | "web";
  chatId: string;
  /** Если задан — используется вместо query `?next=` (встраивание в профиль и т.п.). */
  nextPathOverride?: string;
  /** После успешной привязки без `router.replace` (например, остаться в профиле). */
  onBindSuccess?: () => void;
};

export function BindPhoneBlock({ channel, chatId, nextPathOverride, onBindSuccess }: BindPhoneBlockProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = nextPathOverride?.trim() || searchParams.get("next")?.trim() || "/app/patient";

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
  const [phoneForResend, setPhoneForResend] = useState("");

  const apiChatId = channel === "telegram" ? chatId : getWebChatId();

  if (step === "code" && challengeId) {
    return (
      <div id="bind-phone-code-step" className="stack">
        <p className="eyebrow">Привязка номера телефона</p>
        <SmsCodeForm
          challengeId={challengeId}
          retryAfterSeconds={retryAfterSeconds}
          onConfirm={async (code) => {
            const res = await fetch("/api/auth/phone/confirm", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                challengeId,
                code,
                channel,
                chatId: apiChatId,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              redirectTo?: string;
              message?: string;
              error?: string;
              retryAfterSeconds?: number;
            };
            if (data.ok) {
              if (onBindSuccess) {
                onBindSuccess();
                return { ok: true as const, redirectTo: next };
              }
              router.replace(next);
              return { ok: true as const, redirectTo: next };
            }
            return {
              ok: false as const,
              message: data.message ?? "Ошибка привязки",
              code: data.error,
              retryAfterSeconds: data.retryAfterSeconds,
            };
          }}
          onResend={async () => {
            if (!phoneForResend) return { kind: "error" as const, message: "Нет номера" };
            const res = await fetch("/api/auth/phone/start", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ phone: phoneForResend, channel, chatId: apiChatId }),
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
            setStep("phone");
            setChallengeId(null);
          }}
        />
      </div>
    );
  }

  return (
    <div id="bind-phone-phone-step" className="stack">
      <p className="eyebrow">Привязка номера телефона</p>
      <p className="text-muted-foreground text-sm">
        Для доступа к записям, дневникам и покупкам нужен привязанный номер. Введите его и подтвердите кодом из SMS.
      </p>
      <PhoneAuthForm
        onSubmit={async (phone) => {
          const res = await fetch("/api/auth/phone/start", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ phone, channel, chatId: apiChatId }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            challengeId?: string;
            retryAfterSeconds?: number;
            message?: string;
            error?: string;
          };
          if (data.ok && data.challengeId) {
            return { ok: true as const, challengeId: data.challengeId, retryAfterSeconds: data.retryAfterSeconds };
          }
          if (res.status === 429 || data.error === "rate_limited") {
            return {
              ok: false as const,
              message: "",
              rateLimited: true,
              retryAfterSeconds: data.retryAfterSeconds ?? 60,
            };
          }
          return { ok: false as const, message: data.message ?? "Не удалось отправить код" };
        }}
        onSuccess={(cid, retry, phone) => {
          if (phone) setPhoneForResend(phone);
          setChallengeId(cid);
          setRetryAfterSeconds(retry ?? 60);
          setStep("code");
        }}
      />
    </div>
  );
}
