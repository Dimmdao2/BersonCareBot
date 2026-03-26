"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizePhone } from "@/modules/auth/phoneNormalize";
import { isValidRuMobileNormalized } from "@/modules/auth/phoneValidation";
import { cn } from "@/lib/utils";

type PhoneInputProps = {
  id?: string;
  disabled?: boolean;
  onNormalized?: (normalized: string) => void;
  submitLabel?: string;
  onSubmit: (normalizedPhone: string) => void | Promise<void>;
};

/** Поле телефона с нормализацией перед отправкой. */
export function PhoneInput({
  id = "auth-v2-phone",
  disabled = false,
  onNormalized,
  submitLabel = "Продолжить",
  onSubmit,
}: PhoneInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = normalizePhone(value.trim());
    if (!isValidRuMobileNormalized(n)) {
      setError("Введите корректный номер (10 цифр)");
      return;
    }
    onNormalized?.(n);
    await onSubmit(n);
  };

  return (
    <form className={cn("flex max-w-sm flex-col gap-2")} onSubmit={handleSubmit}>
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor={id}>
        Номер телефона
      </label>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+7 999 123 45 67"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        aria-invalid={!!error}
        aria-label="Номер телефона"
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" disabled={disabled} aria-label={submitLabel}>
        {disabled ? "Подождите…" : submitLabel}
      </Button>
    </form>
  );
}
