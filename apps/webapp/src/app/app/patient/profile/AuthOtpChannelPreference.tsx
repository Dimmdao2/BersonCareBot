'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/patient/primitives/select';
import type { OtpUiChannel } from '@/modules/auth/otpChannelUi';
import { setPreferredAuthOtpChannelAction } from './actions';
import { patientMutedTextClass } from '@/shared/ui/patient/patientVisual';

export type AuthOtpOption = { code: OtpUiChannel; label: string };

type Props = {
  options: AuthOtpOption[];
  /** Явный выбор человека либо вычисленный дефолт (канал, впервые подтвердивший номер). */
  initialSelection: OtpUiChannel | null;
  /** Нет привязанных Telegram/Max и подтверждённого email (только SMS или ничего). */
  showBindHint: boolean;
};

export function AuthOtpChannelPreference({ options, initialSelection, showBindHint }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selection, setSelection] = useState<OtpUiChannel | null>(initialSelection);

  useEffect(() => {
    setSelection(initialSelection);
  }, [initialSelection]);

  if (options.length === 0) {
    return (
      <p className={patientMutedTextClass} id="patient-profile-auth-otp-empty">
        Привяжите удобный вам мессенджер для подтверждения входа.
      </p>
    );
  }

  return (
    <div id="patient-profile-auth-otp" className="flex flex-col gap-2">
      <p className={patientMutedTextClass}>
        Куда отправлять код при входе по номеру телефона (если PIN не задан или нужен сброс).
      </p>
      <div className="max-w-56">
        <Select
          value={selection ?? undefined}
          onValueChange={(raw) => {
            const value = raw as OtpUiChannel;
            setSelection(value);
            startTransition(async () => {
              const res = await setPreferredAuthOtpChannelAction(value);
              if (!res.ok) {
                toast.error(res.message ?? 'Не удалось сохранить');
                router.refresh();
                return;
              }
              toast.success('Настройка сохранена');
            });
          }}
          disabled={pending}
        >
          <SelectTrigger aria-label="Канал подтверждения входа" className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.code} value={o.code}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showBindHint ? (
        <p className={patientMutedTextClass} id="patient-profile-auth-otp-bind-hint">
          Привяжите удобный вам мессенджер для подтверждения входа — так код можно получить не
          только по SMS.
        </p>
      ) : null}
    </div>
  );
}
