'use client';

import { useState, useTransition } from 'react';
import { apiJson } from '@/shared/lib/apiJson';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { SecretSettingInput } from './SecretSettingInput';

type ClinicDeliveryChannelsSectionProps = {
  initial: {
    smtp: {
      configured: boolean;
      host: string;
      port: string;
      secure: boolean;
      user: string;
      from: string;
    };
    smsConfigured: boolean;
    telegramConfigured: boolean;
    maxConfigured: boolean;
    telegramWebhookPath: string | null;
    maxWebhookPath: string | null;
  };
};

async function saveSetting(key: string, value: unknown): Promise<void> {
  await apiJson('/api/admin/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value: { value } }),
  });
}

export function ClinicDeliveryChannelsSection({ initial }: ClinicDeliveryChannelsSectionProps) {
  const [smtp, setSmtp] = useState({ ...initial.smtp, password: '' });
  const [smtpConfigured, setSmtpConfigured] = useState(initial.smtp.configured);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Каналы доставки клиники</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-xs text-muted-foreground">
          Рассылки используют только подключённый канал клиники. Коды, напоминания и уведомления
          сначала используют его, затем канал платформы.
        </p>
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">SMTP</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={smtp.host}
              onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
              placeholder="SMTP host"
            />
            <Input
              value={smtp.port}
              onChange={(e) => setSmtp({ ...smtp, port: e.target.value })}
              placeholder="Порт"
              inputMode="numeric"
            />
            <Input
              value={smtp.user}
              onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
              placeholder="Пользователь"
            />
            <Input
              value={smtp.from}
              onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
              placeholder="Адрес отправителя"
              type="email"
            />
            <Input
              value={smtp.password}
              onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
              placeholder={smtpConfigured ? 'Пароль — только для замены' : 'Пароль'}
              type="password"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={smtp.secure}
                onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })}
              />{' '}
              TLS сразу
            </label>
          </div>
          <Button
            type="button"
            size="sm"
            className="w-fit"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await saveSetting('clinic_smtp_outbound', {
                    host: smtp.host,
                    port: smtp.port,
                    secure: smtp.secure,
                    user: smtp.user,
                    password: smtp.password,
                    from: smtp.from,
                  });
                  setSmtp({ ...smtp, password: '' });
                  setSmtpConfigured(true);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'Не удалось сохранить SMTP');
                }
              })
            }
          >
            Сохранить SMTP
          </Button>
          <p className="text-xs text-muted-foreground">
            {smtpConfigured ? 'Подключён' : 'Не подключён'}
          </p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </section>
        <SecretSettingInput
          title="SMS"
          description="API-ключ SMSC клиники."
          settingKey="clinic_smsc_api_key"
          configured={initial.smsConfigured}
          saveSetting={saveSetting}
        />
        <SecretSettingInput
          title="Telegram-бот"
          description="Токен dedicated bot клиники. Укажите endpoint ниже при регистрации webhook у Telegram."
          settingKey="clinic_telegram_bot_token"
          configured={initial.telegramConfigured}
          saveSetting={saveSetting}
          webhookPath={initial.telegramWebhookPath}
        />
        <SecretSettingInput
          title="MAX-бот"
          description="API-ключ dedicated bot клиники. Укажите endpoint ниже при регистрации webhook у MAX."
          settingKey="clinic_max_bot_api_key"
          configured={initial.maxConfigured}
          saveSetting={saveSetting}
          webhookPath={initial.maxWebhookPath}
        />
      </CardContent>
    </Card>
  );
}
