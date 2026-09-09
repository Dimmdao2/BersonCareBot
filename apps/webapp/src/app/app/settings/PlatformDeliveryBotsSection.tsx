'use client';

import { useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { patchAdminSetting } from './patchAdminSetting';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';

type PlatformBotSettings = {
  telegramKey: 'therapygo_telegram_bot_token' | 'therapysto_telegram_bot_token';
  telegramWebhookSecretKey:
    'therapygo_telegram_webhook_secret' | 'therapysto_telegram_webhook_secret';
  telegramModeKey: 'therapygo_telegram_mode' | 'therapysto_telegram_mode';
  maxKey: 'therapygo_max_bot_api_key' | 'therapysto_max_bot_api_key';
  maxWebhookSecretKey: 'therapygo_max_webhook_secret' | 'therapysto_max_webhook_secret';
  title: string;
};

const PLATFORMS: readonly PlatformBotSettings[] = [
  {
    title: 'TherapyGo — patient delivery',
    telegramKey: 'therapygo_telegram_bot_token',
    telegramWebhookSecretKey: 'therapygo_telegram_webhook_secret',
    telegramModeKey: 'therapygo_telegram_mode',
    maxKey: 'therapygo_max_bot_api_key',
    maxWebhookSecretKey: 'therapygo_max_webhook_secret',
  },
  {
    title: 'Therapysto — staff delivery',
    telegramKey: 'therapysto_telegram_bot_token',
    telegramWebhookSecretKey: 'therapysto_telegram_webhook_secret',
    telegramModeKey: 'therapysto_telegram_mode',
    maxKey: 'therapysto_max_bot_api_key',
    maxWebhookSecretKey: 'therapysto_max_webhook_secret',
  },
];

function PlatformBotForm({ platform }: { platform: PlatformBotSettings }) {
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramWebhookSecret, setTelegramWebhookSecret] = useState('');
  const [telegramMode, setTelegramMode] = useState<'webhook' | 'long_polling'>('long_polling');
  const [maxKey, setMaxKey] = useState('');
  const [maxWebhookSecret, setMaxWebhookSecret] = useState('');
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      try {
        const patches = [];
        if (telegramToken.trim()) {
          patches.push(patchAdminSetting(platform.telegramKey, telegramToken.trim()));
        }
        if (telegramWebhookSecret.trim()) {
          patches.push(
            patchAdminSetting(platform.telegramWebhookSecretKey, telegramWebhookSecret.trim()),
          );
        }
        patches.push(patchAdminSetting(platform.telegramModeKey, telegramMode));
        if (maxKey.trim()) patches.push(patchAdminSetting(platform.maxKey, maxKey.trim()));
        if (maxWebhookSecret.trim()) {
          patches.push(patchAdminSetting(platform.maxWebhookSecretKey, maxWebhookSecret.trim()));
        }
        if (patches.length === 0) return;
        if ((await Promise.all(patches)).some((saved) => !saved)) {
          toast.error('Не удалось сохранить часть настроек');
          return;
        }
        setTelegramToken('');
        setTelegramWebhookSecret('');
        setMaxKey('');
        setMaxWebhookSecret('');
        toast.success('Сохранено');
      } catch {
        toast.error('Ошибка при сохранении');
      }
    });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{platform.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DoctorField label="Telegram bot token" htmlFor={`${platform.telegramKey}-token`}>
          <Input
            id={`${platform.telegramKey}-token`}
            type="password"
            value={telegramToken}
            onChange={(event) => setTelegramToken(event.target.value)}
            disabled={pending}
            autoComplete="new-password"
            placeholder="Оставьте пустым, чтобы не менять"
          />
        </DoctorField>
        <DoctorField label="MAX Bot API key" htmlFor={`${platform.maxKey}-token`}>
          <Input
            id={`${platform.maxKey}-token`}
            type="password"
            value={maxKey}
            onChange={(event) => setMaxKey(event.target.value)}
            disabled={pending}
            autoComplete="new-password"
            placeholder="Оставьте пустым, чтобы не менять"
          />
        </DoctorField>
        <DoctorField
          label="Telegram webhook secret"
          htmlFor={`${platform.telegramWebhookSecretKey}-secret`}
        >
          <Input
            id={`${platform.telegramWebhookSecretKey}-secret`}
            type="password"
            value={telegramWebhookSecret}
            onChange={(event) => setTelegramWebhookSecret(event.target.value)}
            disabled={pending}
            autoComplete="new-password"
            placeholder="Оставьте пустым, чтобы не менять"
          />
        </DoctorField>
        <DoctorField label="Telegram inbound mode" htmlFor={`${platform.telegramModeKey}-mode`}>
          <Select
            value={telegramMode}
            onValueChange={(value) => setTelegramMode(value as 'webhook' | 'long_polling')}
            disabled={pending}
          >
            <SelectTrigger id={`${platform.telegramModeKey}-mode`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="webhook">Webhook</SelectItem>
              <SelectItem value="long_polling">Long polling</SelectItem>
            </SelectContent>
          </Select>
        </DoctorField>
        <DoctorField label="MAX webhook secret" htmlFor={`${platform.maxWebhookSecretKey}-secret`}>
          <Input
            id={`${platform.maxWebhookSecretKey}-secret`}
            type="password"
            value={maxWebhookSecret}
            onChange={(event) => setMaxWebhookSecret(event.target.value)}
            disabled={pending}
            autoComplete="new-password"
            placeholder="Оставьте пустым, чтобы не менять"
          />
        </DoctorField>
        <Button type="button" variant="outline" onClick={save} disabled={pending}>
          {pending ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </CardContent>
    </Card>
  );
}

/** One parameterized platform form; secrets are write-only under the existing settings redaction. */
export function PlatformDeliveryBotsSection() {
  return (
    <div className="flex flex-col gap-6">
      {PLATFORMS.map((platform) => (
        <PlatformBotForm key={platform.title} platform={platform} />
      ))}
    </div>
  );
}
