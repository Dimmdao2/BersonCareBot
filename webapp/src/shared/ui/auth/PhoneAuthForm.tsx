"use client";

import { useState } from "react";

type PhoneAuthFormProps = {
  onSubmit: (phone: string) => Promise<{ ok: true; challengeId: string; retryAfterSeconds?: number } | { ok: false; message: string }>;
  onSuccess: (challengeId: string, retryAfterSeconds?: number, phone?: string) => void;
};

export function PhoneAuthForm({ onSubmit, onSuccess }: PhoneAuthFormProps) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const raw = phone.trim();
    if (!raw) {
      setError("Введите номер телефона");
      return;
    }
    setLoading(true);
    try {
      const result = await onSubmit(raw);
      if (result.ok) {
        onSuccess(result.challengeId, result.retryAfterSeconds, raw);
      } else {
        setError(result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ maxWidth: 320 }}>
      <label className="eyebrow" htmlFor="phone-auth-phone">
        Номер телефона
      </label>
      <input
        id="phone-auth-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+7 999 123 45 67"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        disabled={loading}
        className="auth-input"
        aria-invalid={!!error}
      />
      {error && <p className="empty-state" style={{ fontSize: 14, color: "#9c4242" }}>{error}</p>}
      <button type="submit" className="button" disabled={loading}>
        {loading ? "Отправка…" : "Получить код"}
      </button>
    </form>
  );
}
