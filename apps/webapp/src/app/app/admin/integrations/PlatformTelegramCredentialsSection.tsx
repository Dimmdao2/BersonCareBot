'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { SecretSettingInput } from '@/app/app/settings/SecretSettingInput';

type TelegramCredentialKey = 'telegram_bot_token' | 'telegram_webhook_secret';

type PlatformSetting = {
  key?: string;
  valueJson?: { value?: { configured?: boolean } };
};

export function PlatformTelegramCredentialsSection() {
  const [configured, setConfigured] = useState<Record<TelegramCredentialKey, boolean>>({
    telegram_bot_token: false,
    telegram_webhook_secret: false,
  });

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
            data.settings.find((setting) => setting.key === 'telegram_bot_token')?.valueJson?.value
              ?.configured === true,
          telegram_webhook_secret:
            data.settings.find((setting) => setting.key === 'telegram_webhook_secret')?.valueJson
              ?.value?.configured === true,
        });
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
      </div>
    </DoctorSection>
  );
}
