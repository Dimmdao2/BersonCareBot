"use client";

import { useState } from "react";
import PhoneInput from "react-phone-number-input";
import type { E164Number } from "libphonenumber-js/core";
import { isValidPhoneNumber } from "libphonenumber-js/min";
import { Button } from "@/shared/ui/patient/primitives/button";
import { cn } from "@/lib/utils";
import { AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS } from "@/shared/ui/patient/auth/loginChrome";
import { patientMutedTextClass } from "@/shared/ui/patient/patientVisual";
import "react-phone-number-input/style.css";
import "./international-phone-input.css";

export type InternationalPhoneFieldProps = {
  id?: string;
  disabled?: boolean;
  value: E164Number | undefined;
  onChange: (value: E164Number | undefined) => void;
  onBlur?: () => void;
  className?: string;
  "aria-invalid"?: boolean;
};

/** Поле с выбором страны; значение — E.164 при валидном вводе. */
export function InternationalPhoneField({
  id = "intl-phone-input",
  disabled,
  value,
  onChange,
  onBlur,
  className,
  "aria-invalid": ariaInvalid,
}: InternationalPhoneFieldProps) {
  return (
    <PhoneInput
      international
      defaultCountry="RU"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      limitMaxLength
      smartCaret
      className={cn("PhoneInput w-full", className)}
      numberInputProps={{
        id,
        "aria-label": "Номер телефона",
        "aria-invalid": ariaInvalid,
      }}
    />
  );
}

type InternationalPhoneInputProps = {
  id?: string;
  disabled?: boolean;
  onNormalized?: (normalized: string) => void;
  submitLabel?: string;
  onSubmit: (normalizedPhone: string) => void | Promise<void>;
};

/**
 * Форма: международный ввод, inline-ошибка формата, без toast.
 * Кнопка «Продолжить» неактивна, пока номер не проходит `isValidPhoneNumber`.
 */
export function InternationalPhoneInput({
  id = "auth-v2-phone",
  disabled = false,
  onNormalized,
  submitLabel = "Продолжить",
  onSubmit,
}: InternationalPhoneInputProps) {
  const [value, setValue] = useState<E164Number | undefined>();
  const [touched, setTouched] = useState(false);

  const invalidFormat = Boolean(value && !isValidPhoneNumber(value));
  const showError = touched && invalidFormat;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!value || !isValidPhoneNumber(value)) {
      return;
    }
    onNormalized?.(value);
    await onSubmit(value);
  };

  const canSubmit = Boolean(value && isValidPhoneNumber(value));

  return (
    <form
      className={cn("mx-auto flex w-full max-w-sm flex-col gap-2")}
      onSubmit={handleSubmit}
    >
      <label className={cn(patientMutedTextClass, "text-xs font-normal uppercase tracking-wide")} htmlFor={id}>
        Номер телефона
      </label>
      <div
        className={cn(
          "phone-field-auth flex min-h-10 w-full items-center rounded-md border border-[var(--patient-border)] bg-[var(--patient-card-bg)] px-2 py-1 ring-offset-background focus-within:ring-2 focus-within:ring-[var(--patient-color-primary)] focus-within:ring-offset-2",
          showError && "phone-field-auth--error border-destructive",
        )}
      >
        <InternationalPhoneField
          id={id}
          disabled={disabled}
          value={value}
          onChange={setValue}
          onBlur={() => setTouched(true)}
          className="w-full"
          aria-invalid={showError || undefined}
        />
      </div>
      {showError ? <p className="text-sm text-[var(--patient-color-danger)]">Введите корректный номер</p> : null}
      <Button
        type="submit"
        variant="outline"
        className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
        disabled={disabled || !canSubmit}
        aria-label={submitLabel}
      >
        {disabled ? "Подождите…" : submitLabel}
      </Button>
    </form>
  );
}
