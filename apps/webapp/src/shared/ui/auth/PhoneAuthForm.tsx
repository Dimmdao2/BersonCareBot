"use client";

import { useEffect, useState } from "react";
import type { E164Number } from "libphonenumber-js/core";
import { isValidPhoneNumber } from "libphonenumber-js/min";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InternationalPhoneField } from "@/shared/ui/auth/InternationalPhoneInput";
import "react-phone-number-input/style.css";
import "./international-phone-input.css";

type PhoneAuthSubmitResult =
  | { ok: true; challengeId: string; retryAfterSeconds?: number }
  | { ok: false; message: string; rateLimited?: boolean; retryAfterSeconds?: number };

type PhoneAuthFormProps = {
  onSubmit: (phoneE164: string) => Promise<PhoneAuthSubmitResult>;
  onSuccess: (challengeId: string, retryAfterSeconds?: number, phoneE164?: string) => void;
};

export function PhoneAuthForm({ onSubmit, onSuccess }: PhoneAuthFormProps) {
  const [value, setValue] = useState<E164Number | undefined>();
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startCooldownSec, setStartCooldownSec] = useState(0);

  const invalidFormat = Boolean(value && !isValidPhoneNumber(value));
  const showFormatError = touched && invalidFormat;

  useEffect(() => {
    if (startCooldownSec <= 0) return;
    const t = window.setTimeout(() => setStartCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [startCooldownSec]);

  const canSubmit = Boolean(value && isValidPhoneNumber(value));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTouched(true);
    if (!value || !isValidPhoneNumber(value)) {
      return;
    }
    setLoading(true);
    try {
      const result = await onSubmit(value);
      if (result.ok) {
        setStartCooldownSec(0);
        onSuccess(result.challengeId, result.retryAfterSeconds, value);
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
      <div
        className={cn(
          "phone-field-auth flex min-h-10 w-full items-center rounded-md border border-input bg-background px-2 py-1 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          showFormatError && "phone-field-auth--error border-destructive",
        )}
      >
        <InternationalPhoneField
          id="phone-auth-phone"
          disabled={loading}
          value={value}
          onChange={setValue}
          onBlur={() => setTouched(true)}
          aria-invalid={showFormatError || undefined}
        />
      </div>
      {showFormatError ? <p className="text-sm text-destructive">Введите корректный номер</p> : null}
      {startCooldownSec > 0 ? (
        <p className="text-sm text-muted-foreground">
          Повторная отправка возможна через {startCooldownSec} сек
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        type="submit"
        disabled={loading || startCooldownSec > 0 || !canSubmit}
        aria-label={loading ? "Отправка кода…" : "Получить код по SMS"}
      >
        <span aria-hidden>{loading ? "Отправка…" : "Получить код"}</span>
      </Button>
    </form>
  );
}
