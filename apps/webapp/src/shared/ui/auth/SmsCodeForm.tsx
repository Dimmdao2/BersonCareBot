"use client";

import { useEffect, useState } from "react";

type SmsCodeFormProps = {
  challengeId: string;
  retryAfterSeconds?: number;
  onConfirm: (code: string) => Promise<{ ok: true; redirectTo: string } | { ok: false; message: string }>;
  onResend: () => void;
  onBack: () => void;
};

export function SmsCodeForm({
  challengeId,
  retryAfterSeconds = 60,
  onConfirm,
  onResend,
  onBack,
}: SmsCodeFormProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(retryAfterSeconds);
  const [canResend, setCanResend] = useState(false);

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
    setError(null);
    const raw = code.trim();
    if (!raw) {
      setError("Введите код из SMS");
      return;
    }
    setLoading(true);
    try {
      const result = await onConfirm(raw);
      if (result.ok) {
        return;
      }
      setError(result.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ maxWidth: 320 }}>
      <p className="empty-state" style={{ fontSize: 14 }}>
        Код отправлен в SMS. Введите его ниже.
      </p>
      <label className="eyebrow" htmlFor="sms-code">
        Код подтверждения
      </label>
      <input
        id="sms-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        maxLength={8}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        disabled={loading}
        className="auth-input"
        aria-invalid={!!error}
      />
      {error && <p className="empty-state" style={{ fontSize: 14, color: "#9c4242" }}>{error}</p>}
      <button type="submit" className="button" disabled={loading}>
        {loading ? "Проверка…" : "Войти"}
      </button>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <button type="button" className="button button--ghost" onClick={onBack} disabled={loading}>
          Назад
        </button>
        {canResend ? (
          <button type="button" className="button button--ghost" onClick={onResend} disabled={loading}>
            Отправить код повторно
          </button>
        ) : (
          <span className="empty-state" style={{ fontSize: 13 }}>
            Повторно через {resendCountdown} с
          </span>
        )}
      </div>
    </form>
  );
}
