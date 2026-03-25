"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MethodPickerMethods = {
  sms: true;
  pin?: boolean;
  telegram?: boolean;
  max?: boolean;
  oauth?: {
    yandex?: boolean;
    google?: boolean;
    apple?: boolean;
  };
};

type MethodPickerProps = {
  methods: MethodPickerMethods;
  disabled?: boolean;
  onChoose: (method: "pin" | "sms" | "telegram" | "max" | "oauth_yandex") => void;
};

/** Выбор способа входа (только UI + callback). */
export function MethodPicker({ methods, disabled, onChoose }: MethodPickerProps) {
  return (
    <div className={cn("flex max-w-sm flex-col gap-2")} role="group" aria-label="Способ входа">
      <p className="eyebrow">Как войти</p>
      {methods.pin ? (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          aria-label="Войти по PIN"
          onClick={() => onChoose("pin")}
        >
          PIN-код
        </Button>
      ) : null}
      {methods.telegram ? (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          aria-label="Войти через Telegram"
          onClick={() => onChoose("telegram")}
        >
          Telegram
        </Button>
      ) : null}
      {methods.max ? (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          aria-label="Войти через Max"
          onClick={() => onChoose("max")}
        >
          Max
        </Button>
      ) : null}
      <Button
        type="button"
        variant="default"
        disabled={disabled}
        aria-label="Получить код по SMS"
        onClick={() => onChoose("sms")}
      >
        Код по SMS
      </Button>
    </div>
  );
}
