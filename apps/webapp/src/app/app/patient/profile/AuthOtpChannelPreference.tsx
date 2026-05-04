"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { OtpUiChannel } from "@/modules/auth/otpChannelUi";
import { setPreferredAuthOtpChannelAction } from "./actions";
import { cn } from "@/lib/utils";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";

export type AuthOtpOption = { code: OtpUiChannel; label: string };

type Props = {
  options: AuthOtpOption[];
  /** Текущее сохранённое значение с сервера. */
  initialSelection: "auto" | OtpUiChannel;
  /** Нет привязанных Telegram/Max и подтверждённого email (только SMS или ничего). */
  showBindHint: boolean;
};

export function AuthOtpChannelPreference({ options, initialSelection, showBindHint }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selection, setSelection] = useState<"auto" | OtpUiChannel>(initialSelection);

  useEffect(() => {
    setSelection(initialSelection);
  }, [initialSelection]);

  const apply = (value: "auto" | OtpUiChannel) => {
    setSelection(value);
    startTransition(async () => {
      const res = await setPreferredAuthOtpChannelAction(value);
      if (!res.ok) {
        toast.error(res.message ?? "Не удалось сохранить");
        router.refresh();
        return;
      }
      toast.success("Настройка сохранена");
    });
  };

  if (options.length === 0) {
    return (
      <p className={patientMutedTextClass} id="patient-profile-auth-otp-empty">
        Привяжите удобный вам мессенджер для подтверждения входа.
      </p>
    );
  }

  const rowClass = "flex items-center gap-2 py-1.5";

  return (
    <div id="patient-profile-auth-otp" className="flex flex-col gap-2">
      <p className={patientMutedTextClass}>
        Куда отправлять код при входе по номеру телефона (если PIN не задан или нужен сброс).
      </p>
      <RadioGroup
        value={selection === "auto" ? "auto" : selection}
        onValueChange={(raw) => {
          const value: "auto" | OtpUiChannel = raw === "auto" ? "auto" : (raw as OtpUiChannel);
          apply(value);
        }}
        disabled={pending}
        className="flex flex-col gap-1 border-0 p-0"
        aria-label="Канал подтверждения входа"
      >
        <div className={rowClass}>
          <RadioGroupItem value="auto" id="auth-otp-auto" />
          <Label htmlFor="auth-otp-auto" className={cn("cursor-pointer font-normal", pending && "opacity-60")}>
            Автоматически (Telegram → Max → email → SMS)
          </Label>
        </div>
        {options.map((o) => (
          <div key={o.code} className={rowClass}>
            <RadioGroupItem value={o.code} id={`auth-otp-${o.code}`} />
            <Label htmlFor={`auth-otp-${o.code}`} className={cn("cursor-pointer font-normal", pending && "opacity-60")}>
              {o.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {showBindHint ? (
        <p className={patientMutedTextClass} id="patient-profile-auth-otp-bind-hint">
          Привяжите удобный вам мессенджер для подтверждения входа — так код можно получить не только по SMS.
        </p>
      ) : null}
    </div>
  );
}
