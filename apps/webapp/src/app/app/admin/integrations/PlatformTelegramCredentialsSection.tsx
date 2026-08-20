'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { SecretSettingInput } from '@/app/app/settings/SecretSettingInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';

type TelegramCredentialKey = 'telegram_bot_token' | 'telegram_webhook_secret';
type TelegramMode = 'webhook' | 'long_polling';

type PlatformSetting = {
  key?: string;
  valueJson?: { value?: unknown };
};

function isConfigured(setting: PlatformSetting | undefined): boolean {
  const value = setting?.valueJson?.value;
  return typeof value === 'object' && value !== null && 'configured' in value && value.configured === true;
}

export function PlatformTelegramCredentialsSection() {
  const [configured, setConfigured] = useState<Record<TelegramCredentialKey, boolean>>({
    telegram_bot_token: false,
    telegram_webhook_secret: false,
  });
  const [mode, setMode] = useState<TelegramMode>('long_polling');
  const [savingMode, setSavingMode] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/platform/settings', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: PlatformSetting[];
        };
        if (!response.ok || data.ok !== true || !Array.isArray(data.settings)) {
          throw new Error('settings_unavailable');
        }
        if (!active) return;
        setConfigured({
          telegram_bot_token:
            isConfigured(data.settings.find((setting) => setting.key === 'telegram_bot_token')),
          telegram_webhook_secret: isConfigured(
            data.settings.find((setting) => setting.key === 'telegram_webhook_secret'),
          ),
        });
        const configuredMode = data.settings.find((setting) => setting.key === 'telegram_mode')?.valueJson
          ?.value;
        if (configuredMode === 'webhook' || configuredMode === 'long_polling') {
          setMode(configuredMode);
        }
      })
      .catch(() => {
        if (active) toast.error('Не удалось загрузить учётные данные Telegram');
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveSetting(key: TelegramCredentialKey, value: string): Promise<void> {
    const response = await fetch('/api/platform/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean };
    if (!response.ok || body.ok !== true) throw new Error('save_failed');
    setConfigured((current) => ({ ...current, [key]: true }));
  }

  async function saveMode(next: TelegramMode): Promise<void> {
    const previous = mode;
    setMode(next);
    setSavingMode(true);
    try {
      const response = await fetch('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'telegram_mode', value: next }),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean };
      if (!response.ok || body.ok !== true) throw new Error('save_failed');
    } catch {
      setMode(previous);
      toast.error('Не удалось сохранить режим Telegram');
    } finally {
      setSavingMode(false);
    }
  }

  return (
    <DoctorSection id="platform-telegram-credentials">
      <DoctorSectionHeader>
        <DoctorSectionTitle>Telegram</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="flex max-w-xl flex-col gap-5">
        <SecretSettingInput
          title="Токен бота"
          description="Используется платформенным Telegram-ботом."
          settingKey="telegram_bot_token"
          configured={configured.telegram_bot_token}
          configuredLabel="Задано"
          unconfiguredLabel="Не задано"
          saveSetting={saveSetting}
        />
        <SecretSettingInput
          title="Секрет вебхука"
          description="Используется для проверки запросов Telegram webhook."
          settingKey="telegram_webhook_secret"
          configured={configured.telegram_webhook_secret}
          configuredLabel="Задано"
          unconfiguredLabel="Не задано"
          saveSetting={saveSetting}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="telegram-mode" className="text-sm font-medium">
            Режим приёма сообщений
          </label>
          <Select
            value={mode}
            disabled={savingMode}
            onValueChange={(value) => {
              if (value === 'webhook' || value === 'long_polling') void saveMode(value);
            }}
          >
            <SelectTrigger id="telegram-mode" className="w-full" displayLabel={mode === 'webhook' ? 'Вебхук' : 'Long polling'}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="long_polling">Long polling</SelectItem>
              <SelectItem value="webhook">Вебхук</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Изменение вступит в силу после перезапуска интегратора.
          </p>
        </div>
      </div>
    </DoctorSection>
  );
}
