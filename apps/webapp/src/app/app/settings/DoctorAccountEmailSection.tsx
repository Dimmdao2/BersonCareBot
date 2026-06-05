"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { OtpCodeForm } from "@/shared/ui/patient/auth/OtpCodeForm";

type Props = {
  initialEmail: string | null;
  emailVerified: boolean;
};

export function DoctorAccountEmailSection({ initialEmail, emailVerified }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"view" | "enter" | "code">("view");
  const [emailDraft, setEmailDraft] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retrySec, setRetrySec] = useState(60);
  const [startError, setStartError] = useState<string | null>(null);

  const startEmail = async () => {
    setStartError(null);
    const res = await fetch("/api/auth/email/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailDraft.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      challengeId?: string;
      retryAfterSeconds?: number;
      message?: string;
    };
    if (data.ok && data.challengeId) {
      setChallengeId(data.challengeId);
      setRetrySec(data.retryAfterSeconds ?? 60);
      setStep("code");
      return;
    }
    setStartError(data.message ?? "Не удалось отправить код");
  };

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Email аккаунта</DoctorSectionTitle>
      </DoctorSectionHeader>

      {step === "view" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {initialEmail ? (
                <p className="text-sm">
                  {initialEmail}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {emailVerified ? "(подтверждён)" : "(не подтверждён)"}
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">Не указан</p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setStep("enter");
                setEmailDraft(initialEmail ?? "");
                setStartError(null);
              }}
            >
              {initialEmail ? "Изменить" : "Добавить"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "enter" ? (
        <div className="flex max-w-md flex-col gap-3">
          <label className="text-sm font-medium" htmlFor="doctor-account-email">
            Новый email
          </label>
          <Input
            id="doctor-account-email"
            type="email"
            autoComplete="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder="email@example.com"
          />
          {startError ? <p className="text-destructive text-sm">{startError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void startEmail()}>
              Получить код
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setStep("view");
                setChallengeId(null);
                setStartError(null);
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      {step === "code" && challengeId ? (
        <OtpCodeForm
          challengeId={challengeId}
          retryAfterSeconds={retrySec}
          description="Код отправлен на указанный email. Введите его ниже."
          submitLabel="Подтвердить email"
          onConfirm={async (code) => {
            const res = await fetch("/api/auth/email/confirm", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ challengeId, code }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              message?: string;
              error?: string;
              retryAfterSeconds?: number;
            };
            if (data.ok) {
              setStep("view");
              setChallengeId(null);
              router.refresh();
              return { ok: true as const };
            }
            return {
              ok: false as const,
              message: data.message ?? "Ошибка",
              code: data.error,
              retryAfterSeconds: data.retryAfterSeconds,
            };
          }}
          onResend={async () => {
            const res = await fetch("/api/auth/email/start", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email: emailDraft.trim() }),
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
              setRetrySec(data.retryAfterSeconds ?? 60);
              return { kind: "ok" as const };
            }
            if (res.status === 429 || data.error === "rate_limited") {
              const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
              setRetrySec(sec);
              return { kind: "rate_limited" as const, retryAfterSeconds: sec };
            }
            return { kind: "error" as const, message: data.message ?? "Не удалось отправить код" };
          }}
          onBack={() => {
            setStep("enter");
            setChallengeId(null);
          }}
        />
      ) : null}
    </DoctorSection>
  );
}
