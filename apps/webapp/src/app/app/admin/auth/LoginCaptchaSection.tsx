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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';

type CaptchaProvider = 'altcha' | 'yandex';

export type LoginCaptchaSectionProps = {
  initialEnabled: boolean;
  initialFromAttempt: number;
  initialProvider: CaptchaProvider;
  hasStoredAltchaSecret: boolean;
  hasStoredYandexClientKey: boolean;
  hasStoredYandexServerKey: boolean;
};

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function LoginCaptchaSection({
  initialEnabled,
  initialFromAttempt,
  initialProvider,
  hasStoredAltchaSecret,
  hasStoredYandexClientKey,
  hasStoredYandexServerKey,
}: LoginCaptchaSectionProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [fromAttempt, setFromAttempt] = useState(String(initialFromAttempt));
  const [provider, setProvider] = useState<CaptchaProvider>(initialProvider);
  const [altchaSecretInput, setAltchaSecretInput] = useState('');
  const [altchaSecretStored, setAltchaSecretStored] = useState(hasStoredAltchaSecret);
  const [yandexClientKeyInput, setYandexClientKeyInput] = useState('');
  const [yandexClientKeyStored, setYandexClientKeyStored] = useState(hasStoredYandexClientKey);
  const [yandexServerKeyInput, setYandexServerKeyInput] = useState('');
  const [yandexServerKeyStored, setYandexServerKeyStored] = useState(hasStoredYandexServerKey);
  const [saving, setSaving] = useState<
    'enabled' | 'from' | 'provider' | 'altcha' | 'yandex-client' | 'yandex-server' | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const providerReady =
    provider === 'altcha'
      ? altchaSecretStored
      : yandexClientKeyStored && yandexServerKeyStored;

  const missingProviderText =
    provider === 'altcha'
      ? notificationText.settingsCaptchaAltchaMissing
      : !yandexClientKeyStored && !yandexServerKeyStored
        ? notificationText.settingsCaptchaYandexKeysMissing
        : !yandexClientKeyStored
          ? notificationText.settingsCaptchaYandexClientMissing
          : notificationText.settingsCaptchaYandexServerMissing;

  function showSaveResult(
    result: Awaited<ReturnType<typeof patchAdminSettingWithResult>>,
  ): boolean {
    if (result.ok) return true;
    toast.error(errorCodeText(result.code, notificationText.commonSaveFailed));
    return false;
  }

  function saveSetting(
    kind: NonNullable<typeof saving>,
    key:
      | 'auth_captcha_enabled'
      | 'auth_captcha_from_attempt'
      | 'auth_captcha_provider'
      | 'auth_altcha_hmac_secret'
      | 'auth_yandex_smartcaptcha_client_key'
      | 'auth_yandex_smartcaptcha_server_key',
    value: boolean | number | string,
    onSaved: () => void,
  ): void {
    setSaving(kind);
    startTransition(async () => {
      const result = await patchAdminSettingWithResult(key, value);
      if (showSaveResult(result)) {
        onSaved();
        toast.success(notificationText.commonSaved);
        router.refresh();
      }
      setSaving(null);
    });
  }

  function updateEnabled(nextEnabled: boolean): void {
    saveSetting('enabled', 'auth_captcha_enabled', nextEnabled, () => setEnabled(nextEnabled));
  }

  function updateProvider(nextProvider: string | null): void {
    if (nextProvider !== 'altcha' && nextProvider !== 'yandex') return;
    saveSetting('provider', 'auth_captcha_provider', nextProvider, () => setProvider(nextProvider));
  }

  function saveFromAttempt(): void {
    const attempts = Number(fromAttempt);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 50) {
      toast.error(notificationTextFactory.integerRangeRequired('Номер попытки', 1, 50));
      return;
    }
    saveSetting('from', 'auth_captcha_from_attempt', attempts, () =>
      setFromAttempt(String(attempts)),
    );
  }

  function saveAltchaSecret(): void {
    const secret = altchaSecretInput.trim();
    saveSetting('altcha', 'auth_altcha_hmac_secret', secret, () => {
      setAltchaSecretStored(secret.length > 0);
      setAltchaSecretInput('');
    });
  }

  function saveYandexClientKey(): void {
    const key = yandexClientKeyInput.trim();
    saveSetting('yandex-client', 'auth_yandex_smartcaptcha_client_key', key, () => {
      setYandexClientKeyInput('');
      setYandexClientKeyStored(key.length > 0);
    });
  }

  function saveYandexServerKey(): void {
    const key = yandexServerKeyInput.trim();
    saveSetting('yandex-server', 'auth_yandex_smartcaptcha_server_key', key, () => {
      setYandexServerKeyStored(key.length > 0);
      setYandexServerKeyInput('');
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
        <DoctorField label="Поставщик капчи" htmlFor="auth-captcha-provider" width="lg">
          <Select value={provider} onValueChange={updateProvider} disabled={isPending}>
            <SelectTrigger
              id="auth-captcha-provider"
              displayLabel={provider === 'altcha' ? 'ALTCHA (наша)' : 'Яндекс SmartCaptcha'}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="altcha" label="ALTCHA (наша)">
                ALTCHA (наша)
              </SelectItem>
              <SelectItem value="yandex" label="Яндекс SmartCaptcha">
                Яндекс SmartCaptcha
              </SelectItem>
            </SelectContent>
          </Select>
        </DoctorField>
        <div className="flex flex-col gap-1">
          <LabeledSwitch
            label="Включить капчу при входе по паролю"
            checked={enabled}
            disabled={isPending || !providerReady}
            onCheckedChange={updateEnabled}
          />
          {providerReady ? null : (
            <span className="text-sm text-muted-foreground">{missingProviderText}</span>
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
            <Button type="button" variant="outline" onClick={saveFromAttempt} disabled={isPending}>
              Сохранить
            </Button>
          </div>
        </DoctorField>
        <DoctorField
          label="Секретный ключ ALTCHA"
          htmlFor="auth-captcha-altcha-secret"
          hint={altchaSecretStored ? 'ключ задан' : 'ключ не задан'}
          width="lg"
        >
          <Input
            id="auth-captcha-altcha-secret"
            type="password"
            value={altchaSecretInput}
            onChange={(event) => setAltchaSecretInput(event.target.value)}
            disabled={isPending}
            autoComplete="new-password"
            spellCheck={false}
          />
        </DoctorField>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setAltchaSecretInput(randomHex(32))}
            disabled={isPending}
          >
            Сгенерировать
          </Button>
          <Button
            type="button"
            onClick={saveAltchaSecret}
            disabled={isPending || altchaSecretInput.trim().length === 0}
          >
            Сохранить ключ ALTCHA
          </Button>
        </div>
        <DoctorField
          label="Ключ клиента Яндекс SmartCaptcha"
          htmlFor="auth-captcha-yandex-client-key"
          hint={yandexClientKeyStored ? 'ключ задан' : 'ключ не задан'}
          width="lg"
        >
          <div className="flex items-center gap-3">
            <Input
              id="auth-captcha-yandex-client-key"
              value={yandexClientKeyInput}
              onChange={(event) => setYandexClientKeyInput(event.target.value)}
              disabled={isPending}
              spellCheck={false}
            />
            <Button
              type="button"
              onClick={saveYandexClientKey}
              disabled={isPending || yandexClientKeyInput.trim().length === 0}
            >
              Сохранить
            </Button>
          </div>
        </DoctorField>
        <DoctorField
          label="Ключ сервера Яндекс SmartCaptcha"
          htmlFor="auth-captcha-yandex-server-key"
          hint={yandexServerKeyStored ? 'ключ задан' : 'ключ не задан'}
          width="lg"
        >
          <div className="flex items-center gap-3">
            <Input
              id="auth-captcha-yandex-server-key"
              type="password"
              value={yandexServerKeyInput}
              onChange={(event) => setYandexServerKeyInput(event.target.value)}
              disabled={isPending}
              autoComplete="new-password"
              spellCheck={false}
            />
            <Button
              type="button"
              onClick={saveYandexServerKey}
              disabled={isPending || yandexServerKeyInput.trim().length === 0}
            >
              Сохранить
            </Button>
          </div>
        </DoctorField>
        {saving ? <span className="text-sm text-muted-foreground">Сохранение…</span> : null}
      </div>
    </DoctorSection>
  );
}
