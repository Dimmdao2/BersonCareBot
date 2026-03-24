"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PinInputProps = {
  disabled?: boolean;
  onSubmit: (pin: string) => void | Promise<void>;
  onForgotSms: () => void;
};

/** Ввод PIN (4–6 цифр), без хранения в sessionStorage. */
export function PinInput({ disabled, onSubmit, onForgotSms }: PinInputProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = pin.trim();
    if (!/^\d{4,6}$/.test(trimmed)) {
      setError("Введите от 4 до 6 цифр");
      return;
    }
    await onSubmit(trimmed);
  };

  return (
    <form className={cn("flex max-w-sm flex-col gap-2")} onSubmit={handleSubmit}>
      <label className="eyebrow" htmlFor="auth-pin-field">
        PIN-код
      </label>
      <Input
        id="auth-pin-field"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        disabled={disabled}
        aria-invalid={!!error}
        aria-label="PIN-код"
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" disabled={disabled} aria-label="Войти">
        {disabled ? "Проверка…" : "Войти"}
      </Button>
      <Button type="button" variant="link" className="h-auto min-h-0 px-0 py-0 text-sm font-normal" onClick={onForgotSms}>
        Забыли PIN? Войти по SMS
      </Button>
    </form>
  );
}
