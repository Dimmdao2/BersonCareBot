import { describe, expect, it, vi } from 'vitest';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { DbPort, DeliveryAdapter, OutgoingIntent } from '../kernel/contracts/index.js';
import { createDefaultDispatchPort } from '../infra/adapters/dispatchPort.js';
import {
  readMaxRuntimeConfig,
  readSmscRuntimeConfig,
  readTelegramRuntimeConfig,
} from '../infra/adapters/integrationRuntimeConfig.js';

type SettingValues = Record<string, unknown>;

function dbFor(values: SettingValues, failure?: Error): DbPort {
  return {
    query: vi.fn((query: string, params: unknown[] = []) => {
      if (failure) return Promise.reject(failure);
      const principal = getCurrentDbPrincipal();
      if (principal?.kind !== 'infra' || principal.source !== 'integrator-server-runtime-config') {
        return Promise.reject(new Error('runtime config service principal missing'));
      }
      // Mirrors the locked TEST login: direct credential-table reads are denied, while the
      // fixed-key SECURITY DEFINER capability is executable.
      if (/\bpublic\.system_settings\b/i.test(query)) {
        return Promise.reject(new Error('permission denied for table system_settings'));
      }
      const key = String(params[0] ?? '');
      const value = values[key];
      return Promise.resolve({ rows: value === undefined ? [] : [{ value_json: { value } }] });
    }),
    tx: vi.fn(),
  } as unknown as DbPort;
}

function intent(channel: 'telegram' | 'max' | 'smsc'): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: `runtime-${channel}`,
      occurredAt: new Date().toISOString(),
      source: channel,
      outboundMessageClass: 'operator_security',
      outboundCapability: 'operator_alert',
    },
    payload: {
      recipient: { chatId: 1 },
      message: { text: 'x' },
      delivery: { channels: [channel] },
    },
  } as unknown as OutgoingIntent;
}

const cases = [
  {
    name: 'Telegram',
    channel: 'telegram' as const,
    values: {
      telegram_bot_token: 'bot-token',
      telegram_webhook_secret: 'webhook-secret',
      telegram_send_menu_on_button_press: true,
    },
    read: readTelegramRuntimeConfig,
  },
  {
    name: 'MAX',
    channel: 'max' as const,
    values: {
      max_bot_api_key: 'api-key',
      max_webhook_secret: 'webhook-secret',
      max_api_base_url: 'https://platform-api.max.ru',
    },
    read: readMaxRuntimeConfig,
  },
  {
    name: 'SMSC',
    channel: 'smsc' as const,
    values: {
      smsc_enabled: true,
      smsc_api_key: 'api-key',
      smsc_base_url: 'https://smsc.ru/sys/send.php',
    },
    read: readSmscRuntimeConfig,
  },
] as const;

describe('DB-backed messenger and SMS runtime configuration', () => {
  for (const scenario of cases) {
    it(`${scenario.name}: enables only complete canonical configuration`, async () => {
      await expect(scenario.read(dbFor(scenario.values))).resolves.toMatchObject({ enabled: true });
    });

    it(`${scenario.name}: disabled, missing, malformed, and denied configuration reaches no adapter`, async () => {
      const malformed = { ...scenario.values } as Record<string, unknown>;
      if (scenario.channel === 'max') malformed.max_api_base_url = 'not-a-url';
      if (scenario.channel === 'smsc') malformed.smsc_base_url = 'not-a-url';
      if (scenario.channel === 'telegram') malformed.telegram_webhook_secret = '';
      const disabled = { ...scenario.values } as Record<string, unknown>;
      if (scenario.channel === 'telegram') disabled.telegram_webhook_secret = '';
      if (scenario.channel === 'max') disabled.max_webhook_secret = '';
      if (scenario.channel === 'smsc') disabled.smsc_enabled = false;
      const configurations = [
        dbFor(disabled),
        dbFor({}),
        dbFor(malformed),
        dbFor(scenario.values, new Error('permission denied')),
      ];

      for (const db of configurations) {
        const adapter: DeliveryAdapter = { canHandle: () => true, send: vi.fn() };
        const port = createDefaultDispatchPort({
          adapters: [adapter],
          isPlatformIntegrationEnabled: async () => (await scenario.read(db)).enabled,
        });
        await expect(port.dispatchOutgoing(intent(scenario.channel))).rejects.toThrow(
          `PLATFORM_INTEGRATION_DISABLED:${scenario.channel}`,
        );
        expect(adapter.send).not.toHaveBeenCalled();
      }
    });
  }
});
