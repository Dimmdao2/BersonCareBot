'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { patchAdminSettingWithResult } from '@/app/app/settings/patchAdminSetting';
import { notificationText, notificationTextFactory } from '@/shared/notifications/notificationText';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { LabeledSwitch } from '@/shared/ui/doctor/primitives/labeled-switch';

export type LoginCaptchaSectionProps = {
  initialEnabled: boolean;
  initialAfterFailures: number;
  hasStoredSecret: boolean;
};

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function LoginCaptchaSection({
  initialEnabled,
  initialAfterFailures,
  hasStoredSecret,
}: LoginCaptchaSectionProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [afterFailures, setAfterFailures] = useState(String(initialAfterFailures));
  const [secretInput, setSecretInput] = useState('');
  const [secretStored, setSecretStored] = useState(hasStoredSecret);
  const [saving, setSaving] = useState<'enabled' | 'after' | 'secret' | null>(null);
  const [isPending, startTransition] = useTransition();

  function showSaveResult(
    result: Awaited<ReturnType<typeof patchAdminSettingWithResult>>,
  ): boolean {
    if (result.ok) return true;
    toast.error(result.error ?? notificationText.commonSaveFailed);
    return false;
  }

  function updateEnabled(nextEnabled: boolean): void {
    setSaving('enabled');
    startTransition(async () => {
      const result = await patchAdminSettingWithResult('auth_captcha_enabled', nextEnabled);
      if (showSaveResult(result)) {
        setEnabled(nextEnabled);
        toast.success(notificationText.commonSaved);
        router.refresh();
      }
      setSaving(null);
    });
  }

  function saveAfterFailures(): void {
    const attempts = Number(afterFailures);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 50) {
      toast.error(notificationTextFactory.integerRangeRequired('Количество попыток', 1, 50));
      return;
    }
    setSaving('after');
    startTransition(async () => {
      const result = await patchAdminSettingWithResult('auth_captcha_after_failures', attempts);
      if (showSaveResult(result)) {
        setAfterFailures(String(attempts));
        toast.success(notificationText.commonSaved);
        router.refresh();
      }
      setSaving(null);
    });
  }

  function saveSecret(): void {
    const secret = secretInput.trim();
    setSaving('secret');
    startTransition(async () => {
      const result = await patchAdminSettingWithResult('auth_altcha_hmac_secret', secret);
      if (showSaveResult(result)) {
        setSecretStored(true);
        setSecretInput('');
        toast.success(notificationText.commonSaved);
        router.refresh();
      }
      setSaving(null);
    });
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Капча при входе</DoctorSectionTitle>
      </DoctorSectionHeader>
      <p className="text-sm text-muted-foreground">
        Выключено — капча никому не показывается и не требуется; включено — появляется после N
        неверных попыток подряд.
      </p>
      <div className="flex max-w-xl flex-col gap-4">
        <LabeledSwitch
          label="Включить капчу при входе по паролю"
          checked={enabled}
          disabled={isPending}
          onCheckedChange={updateEnabled}
        />
        <DoctorField
          label="Показывать после скольких неверных попыток"
          htmlFor="auth-captcha-after-failures"
          width="sm"
        >
          <div className="flex items-center gap-3">
            <Input
              id="auth-captcha-after-failures"
              type="number"
              min={1}
              max={50}
              value={afterFailures}
              onChange={(event) => setAfterFailures(event.target.value)}
              disabled={isPending}
            />
            <Button
              type="button"
              variant="outline"
              onClick={saveAfterFailures}
              disabled={isPending}
            >
              Сохранить
            </Button>
          </div>
        </DoctorField>
        <DoctorField
          label="Секретный ключ капчи"
          htmlFor="auth-captcha-secret"
          hint={secretStored ? 'ключ сохранён' : 'ключ не задан'}
          width="lg"
        >
          <Input
            id="auth-captcha-secret"
            type="password"
            value={secretInput}
            onChange={(event) => setSecretInput(event.target.value)}
            disabled={isPending}
            autoComplete="new-password"
            spellCheck={false}
          />
        </DoctorField>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setSecretInput(randomHex(32))}
            disabled={isPending}
          >
            Сгенерировать
          </Button>
          <Button
            type="button"
            onClick={saveSecret}
            disabled={isPending || secretInput.trim().length === 0}
          >
            Сохранить ключ
          </Button>
          {saving ? <span className="text-sm text-muted-foreground">Сохранение…</span> : null}
        </div>
      </div>
    </DoctorSection>
  );
}
