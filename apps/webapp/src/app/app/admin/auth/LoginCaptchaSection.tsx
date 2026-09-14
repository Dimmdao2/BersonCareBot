'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { patchAdminSettingWithResult } from '@/app/app/settings/patchAdminSetting';
import { errorCodeText } from '@/shared/notifications/errorCodeText';
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
  initialFromAttempt: number;
  hasStoredSecret: boolean;
};

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function LoginCaptchaSection({
  initialEnabled,
  initialFromAttempt,
  hasStoredSecret,
}: LoginCaptchaSectionProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [fromAttempt, setFromAttempt] = useState(String(initialFromAttempt));
  const [secretInput, setSecretInput] = useState('');
  const [secretStored, setSecretStored] = useState(hasStoredSecret);
  const [saving, setSaving] = useState<'enabled' | 'from' | 'secret' | null>(null);
  const [isPending, startTransition] = useTransition();

  function showSaveResult(
    result: Awaited<ReturnType<typeof patchAdminSettingWithResult>>,
  ): boolean {
    if (result.ok) return true;
    // Машинный код маршрута человеку не показываем: общая карта кодов выдаёт фразу, а
    // незнакомый код превращается в запасной текст, а не утекает как есть (AGENTS.md §21a).
    toast.error(errorCodeText(result.code, notificationText.commonSaveFailed));
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

  function saveFromAttempt(): void {
    const attempts = Number(fromAttempt);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 50) {
      toast.error(notificationTextFactory.integerRangeRequired('Номер попытки', 1, 50));
      return;
    }
    setSaving('from');
    startTransition(async () => {
      const result = await patchAdminSettingWithResult('auth_captcha_from_attempt', attempts);
      if (showSaveResult(result)) {
        setFromAttempt(String(attempts));
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
        Выключено — капча никому не показывается и не требуется; включено — она требуется начиная с
        указанной попытки подряд. Пароль сам по себе учётную запись не блокирует ни при каких
        настройках.
      </p>
      <div className="flex max-w-xl flex-col gap-4">
        {/* Включить капчу без ключа нельзя: задачка не выдастся, и человек с верным паролем
            останется снаружи. Поэтому переключатель виден, но не нажимается, и рядом сказано
            почему (решение владельца 14.09). Сервер отказывает в том же самостоятельно. */}
        <div className="flex flex-col gap-1">
          <LabeledSwitch
            label="Включить капчу при входе по паролю"
            checked={enabled}
            disabled={isPending || !secretStored}
            onCheckedChange={updateEnabled}
          />
          {secretStored ? null : (
            <span className="text-sm text-muted-foreground">
              Сначала задайте секретный ключ капчи — без него задачка не выдаётся.
            </span>
          )}
        </div>
        <DoctorField
          label="Требовать капчу начиная с какой попытки"
          htmlFor="auth-captcha-from-attempt"
          hint="3 — первые две попытки без капчи, третья уже с ней"
          width="sm"
        >
          <div className="flex items-center gap-3">
            <Input
              id="auth-captcha-from-attempt"
              type="number"
              min={1}
              max={50}
              value={fromAttempt}
              onChange={(event) => setFromAttempt(event.target.value)}
              disabled={isPending}
            />
            <Button
              type="button"
              variant="outline"
              onClick={saveFromAttempt}
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
