"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { OTP_TOO_MANY_ATTEMPTS_MESSAGE } from "@/modules/auth/otpConstants";

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
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [hardBlocked, setHardBlocked] = useState(false);

  useEffect(() => {
    if (step !== "code" || !challengeId) return;
    setCode("");
    setCodeError(null);
    setHardBlocked(false);
    setResendCountdown(retrySec);
    setCanResend(false);
  }, [challengeId, retrySec, step]);

  useEffect(() => {
    if (step !== "code" || canResend) return;
    if (resendCountdown <= 0) {
      setCanResend(true);
      return;
    }
    const t = setInterval(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [canResend, resendCountdown, step]);

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

  const confirmCode = async () => {
    if (!challengeId || hardBlocked) return;
    setCodeError(null);
    const raw = code.trim();
    if (!raw) {
      setCodeError("Введите код");
      return;
    }
    setCodeLoading(true);
    try {
      const res = await fetch("/api/auth/email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId, code: raw }),
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
        return;
      }
      if (data.error === "too_many_attempts") {
        setHardBlocked(true);
        setCodeError(OTP_TOO_MANY_ATTEMPTS_MESSAGE);
        return;
      }
      setCodeError(data.message ?? "Ошибка");
    } finally {
      setCodeLoading(false);
    }
  };

  const resendCode = async () => {
    if (hardBlocked) return;
    setCodeError(null);
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
      return;
    }
    if (res.status === 429 || data.error === "rate_limited") {
      const sec = Math.max(1, Math.ceil(data.retryAfterSeconds ?? 60));
      setCanResend(false);
      setResendCountdown(sec);
      return;
    }
    setCodeError(data.message ?? "Не удалось отправить код");
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
        <div className="flex max-w-md flex-col gap-3">
          <p className="text-muted-foreground text-sm">Код отправлен на указанный email. Введите его ниже.</p>
          <label className="text-sm font-medium" htmlFor="doctor-account-email-code">
            Код подтверждения
          </label>
          <Input
            id="doctor-account-email-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            disabled={codeLoading || hardBlocked}
          />
          {codeError ? <p className="text-destructive text-sm">{codeError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={codeLoading || hardBlocked} onClick={() => void confirmCode()}>
              {codeLoading ? "Проверка…" : "Подтвердить email"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setStep("enter");
                setChallengeId(null);
              }}
            >
              Назад
            </Button>
            {canResend && !hardBlocked ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void resendCode()}>
                Отправить снова
              </Button>
            ) : !hardBlocked ? (
              <span className="text-muted-foreground self-center text-xs">Повтор через {resendCountdown} с</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </DoctorSection>
  );
}
