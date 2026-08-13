import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';
import { createDefaultDispatchPort } from '../adapters/dispatchPort.js';
import { isPlatformIntegrationAvailable } from './platformIntegrationAvailability.js';

const principalFakes = vi.hoisted(() => ({
  runWithInfraPrincipal: vi.fn(
    (_input: { source: string }, fn: () => unknown): unknown => fn(),
  ),
}));

vi.mock('../principal/organizationPrincipal.js', () => ({
  runWithInfraPrincipal: principalFakes.runWithInfraPrincipal,
}));

vi.mock('../../shared/devDeliveryRedirect.js', () => ({
  isDevRedirectActive: () => false,
}));

const enabledAvailability = {
  value: {
    version: 1,
    integrations: {
      telegram: true,
      max: true,
      email: true,
      smsc: true,
      web_push: true,
      google_calendar: true,
      yandex_calendar: true,
    },
  },
};

function availabilityDb(valueJson: unknown | null): DbPort {
  return {
    query: vi
      .fn()
      .mockResolvedValue(valueJson === null ? { rows: [] } : { rows: [{ value_json: valueJson }] }),
    tx: vi.fn(),
  } as unknown as DbPort;
}

function failingDb(error: Error): DbPort {
  return {
    query: vi.fn().mockRejectedValue(error),
    tx: vi.fn(),
  } as unknown as DbPort;
}

function messageSendIntent(): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: 'evt-platform-availability',
      occurredAt: new Date().toISOString(),
      source: 'telegram',
      outboundMessageClass: 'operator_security',
      outboundCapability: 'operator_alert',
    },
    payload: {
      recipient: { chatId: 123 },
      message: { text: 'hello' },
      delivery: { channels: ['telegram'] },
    },
  } as unknown as OutgoingIntent;
}

describe('isPlatformIntegrationAvailable', () => {
  it('always uses the delivery capability, including when called inside an organization flow', async () => {
    principalFakes.runWithInfraPrincipal.mockClear();

    await expect(
      isPlatformIntegrationAvailable(availabilityDb(enabledAvailability), 'telegram'),
    ).resolves.toBe(true);

    expect(principalFakes.runWithInfraPrincipal).toHaveBeenCalledWith(
      { source: 'delivery-handler' },
      expect.any(Function),
    );
  });

  it('returns the canonical enabled and disabled values, including a valid false row', async () => {
    await expect(
      isPlatformIntegrationAvailable(availabilityDb(enabledAvailability), 'telegram'),
    ).resolves.toBe(true);
    await expect(
      isPlatformIntegrationAvailable(
        availabilityDb({
          value: {
            ...enabledAvailability.value,
            integrations: { ...enabledAvailability.value.integrations, telegram: false },
          },
        }),
        'telegram',
      ),
    ).resolves.toBe(false);
  });

  it('rejects a missing or malformed canonical row instead of inventing an availability value', async () => {
    await expect(isPlatformIntegrationAvailable(availabilityDb(null), 'telegram')).rejects.toThrow(
      'PLATFORM_INTEGRATION_AVAILABILITY_UNREADABLE',
    );
    await expect(
      isPlatformIntegrationAvailable(
        availabilityDb({ value: { version: 1, integrations: {} } }),
        'telegram',
      ),
    ).rejects.toThrow('PLATFORM_INTEGRATION_AVAILABILITY_UNREADABLE');
  });

  it('preserves read and permission denials rather than treating either as an enabled default', async () => {
    const readFailure = new Error('connection refused');
    const permissionDenied = new Error('permission denied for table system_settings');

    await expect(isPlatformIntegrationAvailable(failingDb(readFailure), 'telegram')).rejects.toBe(
      readFailure,
    );
    await expect(
      isPlatformIntegrationAvailable(failingDb(permissionDenied), 'telegram'),
    ).rejects.toBe(permissionDenied);
  });
});

describe('platform availability dispatch gate', () => {
  it('delivers only when the typed canonical reader returns enabled', async () => {
    const send = vi.fn(async () => ({ telegramMessageId: 42 }));
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const port = createDefaultDispatchPort({
      adapters: [adapter],
      isPlatformIntegrationEnabled: (integrationId) =>
        isPlatformIntegrationAvailable(availabilityDb(enabledAvailability), integrationId),
    });

    await expect(port.dispatchOutgoing(messageSendIntent())).resolves.toEqual({
      telegramMessageId: 42,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not invoke an adapter when canonical availability is false, missing, unreadable, or denied', async () => {
    const disabledAvailability = {
      value: {
        ...enabledAvailability.value,
        integrations: { ...enabledAvailability.value.integrations, telegram: false },
      },
    };
    const denied = new Error('permission denied for table system_settings');
    const cases: Array<{ name: string; db: DbPort; expected: Error | RegExp }> = [
      {
        name: 'disabled',
        db: availabilityDb(disabledAvailability),
        expected: /PLATFORM_INTEGRATION_DISABLED:telegram/,
      },
      {
        name: 'missing',
        db: availabilityDb(null),
        expected: /PLATFORM_INTEGRATION_AVAILABILITY_UNREADABLE/,
      },
      {
        name: 'unreadable',
        db: availabilityDb({ value: { version: 1, integrations: {} } }),
        expected: /PLATFORM_INTEGRATION_AVAILABILITY_UNREADABLE/,
      },
      { name: 'permission denied', db: failingDb(denied), expected: denied },
    ];

    for (const { db, expected } of cases) {
      const send = vi.fn(async () => ({ telegramMessageId: 42 }));
      const adapter: DeliveryAdapter = { canHandle: () => true, send };
      const port = createDefaultDispatchPort({
        adapters: [adapter],
        isPlatformIntegrationEnabled: (integrationId) =>
          isPlatformIntegrationAvailable(db, integrationId),
      });

      if (expected instanceof Error) {
        await expect(port.dispatchOutgoing(messageSendIntent())).rejects.toBe(expected);
      } else {
        await expect(port.dispatchOutgoing(messageSendIntent())).rejects.toThrow(expected);
      }
      expect(send).not.toHaveBeenCalled();
    }
  });
});
