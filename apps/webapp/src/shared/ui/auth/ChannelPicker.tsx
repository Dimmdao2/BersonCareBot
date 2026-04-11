"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AuthMethodsPayload } from "@/modules/auth/checkPhoneMethods";
import {
  isOtpChannelAvailablePublic,
  OTP_PUBLIC_OTHER_CHANNELS_ORDER,
  pickPrimaryOtpChannelPublic,
  type OtpUiChannel,
} from "@/modules/auth/otpChannelUi";

type ChannelPickerProps = {
  methods: AuthMethodsPayload;
  disabled?: boolean;
  onChoose: (channel: "telegram" | "max" | "email") => void;
};

const PRIMARY_META: Record<
  OtpUiChannel,
  {
    label: string;
    aria: string;
  }
> = {
  telegram: { label: "Telegram", aria: "Получить код в Telegram" },
  max: { label: "Max", aria: "Получить код в Max" },
  email: { label: "Email", aria: "Получить код на email" },
  sms: { label: "Получить код по SMS", aria: "Получить код по SMS" },
};

/** Выбор канала доставки OTP в вебе: только Telegram / Max (SMS отключён). */
export function ChannelPicker({ methods, disabled, onChoose }: ChannelPickerProps) {
  const primary = pickPrimaryOtpChannelPublic(methods);
  const [expanded, setExpanded] = useState(false);

  const others =
    primary == null
      ? []
      : OTP_PUBLIC_OTHER_CHANNELS_ORDER.filter(
          (ch) => ch !== primary && isOtpChannelAvailablePublic(methods, ch),
        );

  const showOtherToggle = others.length > 0;

  const handlePrimary = () => {
    if (primary == null) return;
    if (primary === "telegram" || primary === "max") {
      onChoose(primary);
    }
  };

  if (primary == null) {
    return (
      <div className={cn("flex max-w-sm flex-col gap-2")}>
        <p className="text-sm text-muted-foreground">
          Для этого номера в браузере нет способа получить код: нужен Telegram или Max, привязанные к аккаунту. Войдите
          через Яндекс, Google или Apple (если доступно) или укажите другой номер.
        </p>
      </div>
    );
  }

  const primaryLabel = PRIMARY_META[primary].label;
  const primaryAria = PRIMARY_META[primary].aria;

  return (
    <div className={cn("flex max-w-sm flex-col gap-2")} role="group" aria-label="Способ получения кода">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Выберите, где вам удобно получить код для входа:
      </p>
      <Button type="button" disabled={disabled} aria-label={primaryAria} onClick={handlePrimary}>
        {primaryLabel}
      </Button>

      {showOtherToggle ? (
        <>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            className="w-fit text-left text-sm text-muted-foreground underline hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            Другие способы
          </button>
          {expanded ? (
            <div className="flex flex-col gap-2 pl-1">
              {others.map((ch) => {
                const label =
                  ch === "telegram"
                    ? "Telegram"
                    : ch === "max"
                      ? "Max"
                      : methods.emailAddress
                        ? `Email (${methods.emailAddress})`
                        : "Email";
                const aria = PRIMARY_META[ch].aria;
                return (
                  <Button
                    key={ch}
                    type="button"
                    variant="secondary"
                    disabled={disabled}
                    aria-label={aria}
                    onClick={() => {
                      if (ch === "telegram" || ch === "max") {
                        onChoose(ch);
                      }
                      setExpanded(false);
                    }}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
