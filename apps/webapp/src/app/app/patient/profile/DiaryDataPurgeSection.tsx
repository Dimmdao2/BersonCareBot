"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PinInput } from "@/shared/ui/auth/PinInput";
import { SmsCodeForm } from "@/shared/ui/auth/SmsCodeForm";
import { cn } from "@/lib/utils";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";

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
      <div className={cn(patientMutedTextClass, "flex flex-col gap-2")}>
        <p>Чтобы удалить данные дневников, сначала задайте PIN в разделе «PIN для входа» выше.</p>
      </div>
    );
  }

  if (!phoneMasked) {
    return (
      <div className={cn(patientMutedTextClass, "flex flex-col gap-2")}>
        <p>Чтобы подтвердить удаление по телефону, привяжите номер в профиле.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {step === "intro" ? (
        <>
          <p className={patientMutedTextClass}>
            Будут удалены все отслеживания симптомов, записи и данные ЛФК. Профиль и карта клиента у врача сохранятся.
          </p>
          <div className="flex items-start gap-3 text-sm">
            <Switch
              id="diary-purge-consent"
              checked={accepted}
              onCheckedChange={setAccepted}
              aria-label="Согласие: операцию удаления данных дневников нельзя отменить"
            />
            <Label htmlFor="diary-purge-consent" className="cursor-pointer leading-snug font-normal">
              Я понимаю, что эту операцию нельзя отменить.
            </Label>
          </div>
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
          <p className={patientMutedTextClass}>Введите PIN для подтверждения.</p>
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
          <p className={patientMutedTextClass}>
            Код отправлен на номер {phoneMasked}. Введите его для финального подтверждения.
          </p>
          {otpLoading || !challengeId ? (
            <p className={patientMutedTextClass}>Отправляем код…</p>
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
