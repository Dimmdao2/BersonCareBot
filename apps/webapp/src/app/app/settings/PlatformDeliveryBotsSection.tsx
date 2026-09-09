'use client';

import { useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { patchAdminSetting } from './patchAdminSetting';

type PlatformBotSettings = {
  telegramKey: 'therapygo_telegram_bot_token' | 'therapysto_telegram_bot_token';
  maxKey: 'therapygo_max_bot_api_key' | 'therapysto_max_bot_api_key';
  title: string;
};

const PLATFORMS: readonly PlatformBotSettings[] = [
  {
    title: 'TherapyGo — patient delivery',
    telegramKey: 'therapygo_telegram_bot_token',
    maxKey: 'therapygo_max_bot_api_key',
  },
  {
    title: 'Therapysto — staff delivery',
    telegramKey: 'therapysto_telegram_bot_token',
    maxKey: 'therapysto_max_bot_api_key',
  },
];

function PlatformBotForm({ platform }: { platform: PlatformBotSettings }) {
  const [telegramToken, setTelegramToken] = useState('');
  const [maxKey, setMaxKey] = useState('');
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      try {
        const patches = [];
        if (telegramToken.trim()) {
          patches.push(patchAdminSetting(platform.telegramKey, telegramToken.trim()));
        }
        if (maxKey.trim()) patches.push(patchAdminSetting(platform.maxKey, maxKey.trim()));
        if (patches.length === 0) return;
        if ((await Promise.all(patches)).some((saved) => !saved)) {
          toast.error('Не удалось сохранить часть настроек');
          return;
        }
        setTelegramToken('');
        setMaxKey('');
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
