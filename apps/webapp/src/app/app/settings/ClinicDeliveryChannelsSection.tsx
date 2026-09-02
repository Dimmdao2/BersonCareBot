'use client';

import { useState, useTransition } from 'react';
import { apiJson } from '@/shared/lib/apiJson';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { SecretSettingInput } from './SecretSettingInput';
import {
  isPlatformIntegrationAvailable,
  type PlatformIntegrationAvailability,
} from '@/modules/system-settings/platformIntegrationAvailability';
import type { ClinicDeliveryReadiness } from '@/modules/system-settings/clinicDeliveryReadiness';
import {
  CLINIC_BOT_PUBLIC_CONFIG_NONE,
  type ClinicBotPublicConfig,
} from '@/modules/system-settings/clinicBotConfig';

type ClinicDeliveryChannelsSectionProps = {
  platformAvailability: PlatformIntegrationAvailability;
  smtpEntitled: boolean;
  initial: {
    smtp: {
      configured: boolean;
      host: string;
      port: string;
      secure: boolean;
      user: string;
      from: string;
      readiness: ClinicDeliveryReadiness;
    };
    smsConfigured: boolean;
    telegramConfigured: boolean;
    telegramReadiness: ClinicDeliveryReadiness;
    telegramBot?: ClinicBotPublicConfig;
    maxConfigured: boolean;
    maxReadiness: ClinicDeliveryReadiness;
    maxBot?: ClinicBotPublicConfig;
    vkConfigured: boolean;
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

/**
 * Публичный ник и настройки пересылки живут в ТОЙ ЖЕ настройке бота, что и credential: пустая
 * строка `value` означает «оставить сохранённый токен» (сервер его подставляет сам).
 */
async function saveBotSetting(
  key: 'clinic_telegram_bot_token' | 'clinic_max_bot_api_key',
  config: ClinicBotPublicConfig,
): Promise<void> {
  await apiJson('/api/admin/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      value: {
        value: '',
        botPublicId: config.botPublicId ?? '',
        inboundForwarding: config.inboundForwarding ?? { enabled: false, destinationChatId: '' },
      },
    }),
  });
}

/**
 * Публичная половина настройки собственного бота клиники: ник для диплинков подтверждения телефона
 * и пересылка входящих. Одна форма на обе платформы — различается только заголовок и ключ.
 */
function ClinicBotPublicSettings({
  settingKey,
  handleLabel,
  configured,
  initial,
}: Readonly<{
  settingKey: 'clinic_telegram_bot_token' | 'clinic_max_bot_api_key';
  handleLabel: string;
  configured: boolean;
  initial: ClinicBotPublicConfig;
}>) {
  const [botPublicId, setBotPublicId] = useState(initial.botPublicId ?? '');
  const [forwardingEnabled, setForwardingEnabled] = useState(
    initial.inboundForwarding?.enabled === true,
  );
  const [destinationChatId, setDestinationChatId] = useState(
    initial.inboundForwarding?.destinationChatId ?? '',
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!configured) {
    return (
      <p className="text-xs text-muted-foreground">
        Сохраните credential бота — тогда станут доступны ник для входа и пересылка входящих.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={botPublicId}
        onChange={(event) => setBotPublicId(event.target.value)}
        placeholder={handleLabel}
        spellCheck={false}
        disabled={pending}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={forwardingEnabled}
          disabled={pending}
          onChange={(event) => setForwardingEnabled(event.target.checked)}
        />{' '}
        Пересылать входящие сообщения
      </label>
      <Input
        value={destinationChatId}
        onChange={(event) => setDestinationChatId(event.target.value)}
        placeholder="Id чата, куда пересылать"
        inputMode="numeric"
        spellCheck={false}
        disabled={pending}
      />
      <p className="text-xs text-muted-foreground">
        Пока пересылка выключена, входящие сообщения игнорируются. Переписка не сохраняется:
        сообщение уходит в указанный чат напрямую.
      </p>
      <Button
        type="button"
        size="sm"
        className="w-fit"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await saveBotSetting(settingKey, {
                botPublicId: botPublicId.trim() ? botPublicId.trim() : null,
                inboundForwarding: {
                  enabled: forwardingEnabled,
                  destinationChatId: destinationChatId.trim(),
                },
              });
              setSaved(true);
            } catch (cause) {
              setSaved(false);
              setError(
                cause instanceof Error && cause.message.trim()
                  ? cause.message
                  : 'Не удалось сохранить настройки бота.',
              );
            }
          })
        }
      >
        Сохранить настройки бота
      </Button>
      {saved ? <p className="text-xs text-muted-foreground">Настройки бота сохранены</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

type ProbeChannel = 'email' | 'telegram' | 'max';

function ChannelReadinessStatus({
  configured,
  readiness,
  pending,
  onTest,
}: Readonly<{
  configured: boolean;
  readiness: ClinicDeliveryReadiness;
  pending: boolean;
  onTest: () => void;
}>) {
  const text =
    readiness.status === 'enabled'
      ? 'Канал включён'
      : readiness.status === 'failed'
        ? `Проверка не прошла: ${readiness.reason}`
        : 'Ждём проверочной отправки';
  return (
    <div className="flex flex-col items-start gap-2">
      <p
        className={
          readiness.status === 'failed'
            ? 'text-xs text-destructive'
            : 'text-xs text-muted-foreground'
        }
      >
        {text}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!configured || pending}
        onClick={onTest}
      >
        {pending ? 'Отправляем…' : 'Отправить проверку себе'}
      </Button>
    </div>
  );
}

export function ClinicDeliveryChannelsSection({
  initial,
  platformAvailability,
  smtpEntitled,
}: ClinicDeliveryChannelsSectionProps) {
  const [smtp, setSmtp] = useState({ ...initial.smtp, password: '' });
  const [smtpConfigured, setSmtpConfigured] = useState(initial.smtp.configured);
  const [telegramConfigured, setTelegramConfigured] = useState(initial.telegramConfigured);
  const [maxConfigured, setMaxConfigured] = useState(initial.maxConfigured);
  const [readiness, setReadiness] = useState({
    email: initial.smtp.readiness,
    telegram: initial.telegramReadiness,
    max: initial.maxReadiness,
  });
  const [probePending, setProbePending] = useState<ProbeChannel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const testChannel = (channel: ProbeChannel) => {
    setProbePending(channel);
    setError(null);
    startTransition(async () => {
      try {
        const result = await apiJson<{ ok: true; readiness: ClinicDeliveryReadiness }>(
          '/api/admin/clinic-delivery-test',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel }),
          },
        );
        setReadiness((current) => ({ ...current, [channel]: result.readiness }));
      } catch (cause) {
        const reason =
          cause instanceof Error && cause.message.trim()
            ? cause.message
            : 'Канал не принял проверочное сообщение.';
        setReadiness((current) => ({
          ...current,
          [channel]: { status: 'failed', checkedAt: new Date().toISOString(), reason },
        }));
      } finally {
        setProbePending(null);
      }
    });
  };

  return (
    <Card id="clinic-delivery-channels" className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Каналы доставки клиники</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-xs text-muted-foreground">
          Пока проверка собственного канала не прошла, сообщения продолжает доставлять канал
          платформы от имени клиники.
        </p>
        {isPlatformIntegrationAvailable(platformAvailability, 'email') ? (
          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold">SMTP</p>
            {!smtpEntitled ? (
              <p className="text-xs text-muted-foreground">
                Собственный SMTP недоступен на вашем тарифе.
              </p>
            ) : (
              <>
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
                        setReadiness((current) => ({
                          ...current,
                          email: { status: 'pending' },
                        }));
                      } catch (cause) {
                        setError(
                          cause instanceof Error && cause.message.trim()
                            ? cause.message
                            : 'Сервер не смог сохранить SMTP. Повторите позже.',
                        );
                      }
                    })
                  }
                >
                  Сохранить SMTP
                </Button>
                <p className="text-xs text-muted-foreground">
                  {smtpConfigured ? 'Настройки сохранены' : 'Настройки не сохранены'}
                </p>
                <ChannelReadinessStatus
                  configured={smtpConfigured}
                  readiness={readiness.email}
                  pending={probePending === 'email'}
                  onTest={() => testChannel('email')}
                />
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
              </>
            )}
          </section>
        ) : null}
        {isPlatformIntegrationAvailable(platformAvailability, 'smsc') ? (
          <SecretSettingInput
            title="SMS"
            description="API-ключ SMSC клиники."
            settingKey="clinic_smsc_api_key"
            configured={initial.smsConfigured}
            saveSetting={saveSetting}
          />
        ) : null}
        {isPlatformIntegrationAvailable(platformAvailability, 'telegram') ? (
          <>
            <SecretSettingInput
              title="Telegram-бот"
              description="Токен dedicated bot клиники. Укажите endpoint ниже при регистрации webhook у Telegram."
              settingKey="clinic_telegram_bot_token"
              configured={telegramConfigured}
              configuredLabel="Настройки сохранены"
              saveSetting={saveSetting}
              webhookPath={initial.telegramWebhookPath}
              onSaved={() => {
                setTelegramConfigured(true);
                setReadiness((current) => ({ ...current, telegram: { status: 'pending' } }));
              }}
            />
            <ChannelReadinessStatus
              configured={telegramConfigured}
              readiness={readiness.telegram}
              pending={probePending === 'telegram'}
              onTest={() => testChannel('telegram')}
            />
            <ClinicBotPublicSettings
              settingKey="clinic_telegram_bot_token"
              handleLabel="Публичный @username бота"
              configured={telegramConfigured}
              initial={initial.telegramBot ?? CLINIC_BOT_PUBLIC_CONFIG_NONE}
            />
          </>
        ) : null}
        {isPlatformIntegrationAvailable(platformAvailability, 'max') ? (
          <>
            <SecretSettingInput
              title="MAX-бот"
              description="API-ключ dedicated bot клиники. Укажите endpoint ниже при регистрации webhook у MAX."
              settingKey="clinic_max_bot_api_key"
              configured={maxConfigured}
              configuredLabel="Настройки сохранены"
              saveSetting={saveSetting}
              webhookPath={initial.maxWebhookPath}
              onSaved={() => {
                setMaxConfigured(true);
                setReadiness((current) => ({ ...current, max: { status: 'pending' } }));
              }}
            />
            <ChannelReadinessStatus
              configured={maxConfigured}
              readiness={readiness.max}
              pending={probePending === 'max'}
              onTest={() => testChannel('max')}
            />
            <ClinicBotPublicSettings
              settingKey="clinic_max_bot_api_key"
              handleLabel="Публичный ник бота MAX"
              configured={maxConfigured}
              initial={initial.maxBot ?? CLINIC_BOT_PUBLIC_CONFIG_NONE}
            />
          </>
        ) : null}
        {isPlatformIntegrationAvailable(platformAvailability, 'vk') ? (
          <SecretSettingInput
            title="Сообщество VK"
            description="Токен сообщества для исходящих сообщений от имени клиники. Входящий Callback API остаётся у сообщества платформы."
            settingKey="clinic_vk_community_access_token"
            configured={initial.vkConfigured}
            saveSetting={saveSetting}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
