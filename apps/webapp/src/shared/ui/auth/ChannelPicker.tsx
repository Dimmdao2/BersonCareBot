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
  onChooseSms: () => void;
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

/** Выбор канала доставки OTP: основной канал (primary-кнопка) и «Другие способы». */
export function ChannelPicker({ methods, disabled, onChoose, onChooseSms }: ChannelPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const primary = pickPrimaryOtpChannelPublic(methods);

  const others =
    primary == null
      ? []
      : OTP_PUBLIC_OTHER_CHANNELS_ORDER.filter(
          (ch) => ch !== primary && isOtpChannelAvailablePublic(methods, ch),
        );

  const showOtherToggle = others.length > 0;
  const primaryLabel = primary != null ? PRIMARY_META[primary].label : "";
  const primaryAria = primary != null ? PRIMARY_META[primary].aria : "";

  const handlePrimary = () => {
    if (primary == null) return;
    if (primary === "sms") {
      onChooseSms();
      return;
    }
    onChoose(primary);
  };

  if (primary == null) {
    return (
      <div className={cn("flex max-w-sm flex-col gap-2")}>
        <p className="text-sm text-muted-foreground">
          Нет доступных способов получения кода для этого номера в вебе. Войдите через Telegram или укажите другой
          номер.
        </p>
      </div>
    );
  }

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
                if (ch === "sms") {
                  return (
                    <button
                      key="sms"
                      type="button"
                      className="w-fit text-left text-sm text-muted-foreground underline hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                      disabled={disabled}
                      onClick={() => {
                        onChooseSms();
                        setExpanded(false);
                      }}
                    >
                      Получить код по SMS
                    </button>
                  );
                }
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
                      onChoose(ch);
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
