"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OTP_TOO_MANY_ATTEMPTS_MESSAGE } from "@/modules/auth/otpConstants";

export type OtpConfirmResult =
  | { ok: true; redirectTo?: string }
  | {
      ok: false;
      message: string;
      code?: string;
      retryAfterSeconds?: number;
    };

type OtpCodeFormProps = {
  challengeId: string;
  retryAfterSeconds?: number;
  submitLabel?: string;
  description?: string;
  onConfirm: (code: string) => Promise<OtpConfirmResult>;
  onResend: () => void;
  onBack: () => void;
};

export function OtpCodeForm({
  challengeId,
  retryAfterSeconds = 60,
  submitLabel = "Подтвердить",
  description = "Введите код ниже.",
  onConfirm,
  onResend,
  onBack,
}: OtpCodeFormProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(retryAfterSeconds);
  const [canResend, setCanResend] = useState(false);
  const [hardBlocked, setHardBlocked] = useState(false);

  /** Новый challenge / интервал после повторной отправки — сброс поля и таймера. */
  useEffect(() => {
    setCode("");
    setError(null);
    setHardBlocked(false);
    setResendCountdown(retryAfterSeconds);
    setCanResend(false);
  }, [challengeId, retryAfterSeconds]);

  useEffect(() => {
    if (canResend) return;
    if (resendCountdown <= 0) {
      setCanResend(true);
      return;
    }
    const t = setInterval(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCountdown, canResend]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hardBlocked) return;
    setError(null);
    const raw = code.trim();
    if (!raw) {
      setError("Введите код");
      return;
    }
    setLoading(true);
    try {
      const result = await onConfirm(raw);
      if (result.ok) {
        return;
      }
      if (result.code === "too_many_attempts") {
        setHardBlocked(true);
        setError(OTP_TOO_MANY_ATTEMPTS_MESSAGE);
      } else {
        setError(result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id={`otp-code-form-${challengeId}`} onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-3">
      <p className="text-muted-foreground text-sm">{description}</p>
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs font-medium uppercase tracking-wide" htmlFor={`otp-${challengeId}`}>
          Код подтверждения
        </label>
        <Input
          id={`otp-${challengeId}`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          disabled={loading || hardBlocked}
          aria-invalid={!!error}
        />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" disabled={loading || hardBlocked}>
        {loading ? "Проверка…" : submitLabel}
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={loading}>
          Назад
        </Button>
        {canResend && !hardBlocked ? (
          <Button type="button" variant="ghost" size="sm" onClick={onResend} disabled={loading}>
            Отправить код повторно
          </Button>
        ) : !hardBlocked ? (
          <span className="text-muted-foreground text-xs">Повторно через {resendCountdown} с</span>
        ) : null}
      </div>
    </form>
  );
}
