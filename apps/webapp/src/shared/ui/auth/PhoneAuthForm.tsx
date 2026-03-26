"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PhoneAuthSubmitResult =
  | { ok: true; challengeId: string; retryAfterSeconds?: number }
  | { ok: false; message: string; rateLimited?: boolean; retryAfterSeconds?: number };

type PhoneAuthFormProps = {
  onSubmit: (phone: string) => Promise<PhoneAuthSubmitResult>;
  onSuccess: (challengeId: string, retryAfterSeconds?: number, phone?: string) => void;
};

export function PhoneAuthForm({ onSubmit, onSuccess }: PhoneAuthFormProps) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startCooldownSec, setStartCooldownSec] = useState(0);

  useEffect(() => {
    if (startCooldownSec <= 0) return;
    const t = window.setTimeout(() => setStartCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [startCooldownSec]);

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
        setStartCooldownSec(0);
        onSuccess(result.challengeId, result.retryAfterSeconds, raw);
      } else if (result.rateLimited && result.retryAfterSeconds != null) {
        setError(null);
        setStartCooldownSec(Math.max(1, Math.ceil(result.retryAfterSeconds)));
      } else {
        setError(result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="phone-auth-form" onSubmit={handleSubmit} className="flex max-w-xs flex-col gap-4">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="phone-auth-phone">
        Номер телефона
      </label>
      <Input
        id="phone-auth-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+7 999 123 45 67"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        disabled={loading}
        aria-invalid={!!error}
      />
      {startCooldownSec > 0 ? (
        <p className="text-sm text-muted-foreground">
          Повторная отправка возможна через {startCooldownSec} сек
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        type="submit"
        disabled={loading || startCooldownSec > 0}
        aria-label={loading ? "Отправка кода…" : "Получить код по SMS"}
      >
        <span aria-hidden>{loading ? "Отправка…" : "Получить код"}</span>
      </Button>
    </form>
  );
}
