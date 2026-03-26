"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AuthMethodsPayload } from "@/modules/auth/checkPhoneMethods";

type ChannelPickerProps = {
  methods: AuthMethodsPayload;
  disabled?: boolean;
  onChoose: (channel: "telegram" | "max" | "email") => void;
  onChooseSms: () => void;
};

/** Выбор канала доставки OTP (без PIN — PIN вынесен в отдельный шаг). */
export function ChannelPicker({ methods, disabled, onChoose, onChooseSms }: ChannelPickerProps) {
  return (
    <div className={cn("flex max-w-sm flex-col gap-2")} role="group" aria-label="Способ получения кода">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Выберите, где вам удобно получить код для входа:</p>
      {methods.telegram ? (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          aria-label="Получить код в Telegram"
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
          aria-label="Получить код в Max"
          onClick={() => onChoose("max")}
        >
          Max
        </Button>
      ) : null}
      {methods.email ? (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          aria-label="Получить код на email"
          onClick={() => onChoose("email")}
        >
          Email
        </Button>
      ) : null}
      <Button
        type="button"
        variant="link"
        className="h-auto min-h-0 px-0 py-0 text-xs font-normal"
        disabled={disabled}
        onClick={onChooseSms}
      >
        получить код по СМС
      </Button>
    </div>
  );
}
