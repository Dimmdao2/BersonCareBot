"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PinInput } from "@/shared/ui/auth/PinInput";
import { SmsCodeForm } from "@/shared/ui/auth/SmsCodeForm";

type Props = {
  hasPin: boolean;
  phoneMasked: string | null;
};

/**
 * Удаление всех дневниковых данных: явное согласие → PIN → код на телефон.
 */
export function DiaryDataPurgeSection({ hasPin, phoneMasked }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"intro" | "pin" | "otp">("intro");
  const [accepted, setAccepted] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
  const [otpLoading, setOtpLoading] = useState(false);

  useEffect(() => {
    if (step !== "otp" || challengeId || otpLoading) return;
    setOtpLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/patient/diary/purge-otp/start", {
          method: "POST",
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          challengeId?: string;
          retryAfterSeconds?: number;
          error?: string;
          message?: string;
        };
        if (res.ok && data.ok && data.challengeId) {
          setChallengeId(data.challengeId);
          setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
        } else {
          toast.error(data.message ?? "Не удалось отправить код");
          setStep("pin");
        }
      } catch {
        toast.error("Сеть недоступна");
        setStep("pin");
      } finally {
        setOtpLoading(false);
      }
    })();
  }, [step, challengeId, otpLoading]);

  if (!hasPin) {
    return (
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>Чтобы удалить данные дневников, сначала задайте PIN в разделе «PIN для входа» выше.</p>
      </div>
    );
  }

  if (!phoneMasked) {
    return (
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>Чтобы подтвердить удаление по телефону, привяжите номер в профиле.</p>
      </div>
    );
  }

  return (
    <div id="patient-profile-diary-purge" className="flex flex-col gap-4">
      {step === "intro" ? (
        <>
          <p className="text-muted-foreground text-sm">
            Будут удалены все отслеживания симптомов, записи и данные ЛФК. Профиль и карта клиента у врача сохранятся.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border border-input"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>Я понимаю, что эту операцию нельзя отменить.</span>
          </label>
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={!accepted}
            onClick={() => setStep("pin")}
          >
            Удалить данные дневников
          </Button>
        </>
      ) : null}

      {step === "pin" ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">Введите PIN для подтверждения.</p>
          <PinInput
            submitLabel="Далее"
            forgotHidden
            onForgot={() => {}}
            onSubmit={async (pin) => {
              const res = await fetch("/api/auth/pin/verify", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ pin }),
              });
              const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
              if (!res.ok) {
                toast.error(data.message ?? "Неверный PIN");
                return;
              }
              toast.success("PIN подтверждён");
              setStep("otp");
            }}
          />
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setStep("intro")}>
            Назад
          </Button>
        </div>
      ) : null}

      {step === "otp" ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Код отправлен на номер {phoneMasked}. Введите его для финального подтверждения.
          </p>
          {otpLoading || !challengeId ? (
            <p className="text-sm text-muted-foreground">Отправляем код…</p>
          ) : (
            <SmsCodeForm
              challengeId={challengeId}
              retryAfterSeconds={retryAfterSeconds}
              description="Введите код из SMS."
              submitLabel="Удалить данные"
              onConfirm={async (code) => {
                const res = await fetch("/api/patient/diary/purge", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ challengeId, code }),
                });
                const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
                if (!res.ok) {
                  return {
                    ok: false as const,
                    message: data.message ?? "Не удалось подтвердить",
                    code: data.error,
                  };
                }
                toast.success("Данные дневников удалены");
                router.refresh();
                setStep("intro");
                setAccepted(false);
                setChallengeId(null);
                return { ok: true as const };
              }}
              onResend={async () => {
                const res = await fetch("/api/patient/diary/purge-otp/start", {
                  method: "POST",
                  credentials: "include",
                });
                const data = (await res.json().catch(() => ({}))) as {
                  ok?: boolean;
                  challengeId?: string;
                  retryAfterSeconds?: number;
                };
                if (res.ok && data.ok && data.challengeId) {
                  setChallengeId(data.challengeId);
                  setRetryAfterSeconds(data.retryAfterSeconds ?? 60);
                  return { kind: "ok" as const };
                }
                if (res.status === 429) {
                  return {
                    kind: "rate_limited" as const,
                    retryAfterSeconds: data.retryAfterSeconds ?? 60,
                  };
                }
                return { kind: "error" as const, message: "Не удалось отправить код" };
              }}
              onBack={() => {
                setStep("pin");
                setChallengeId(null);
              }}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
