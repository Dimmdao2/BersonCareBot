import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithOrganizationPrincipal } from '../principal/organizationPrincipal.js';

const mocks = vi.hoisted(() => ({
  readCredential: vi.fn(),
  resolveAccess: vi.fn(),
}));

vi.mock('./publicSystemSettings.js', async () => {
  const actual = await vi.importActual<typeof import('./publicSystemSettings.js')>(
    './publicSystemSettings.js',
  );
  return {
    ...actual,
    fetchIntegratorClinicDeliveryCredentialValueJson: mocks.readCredential,
  };
});
vi.mock('./organizationMechanicLifecycleDoor.js', () => ({
  resolveOrganizationMechanicLifecycleAccess: mocks.resolveAccess,
}));

import { createClinicDeliveryCredentialResolver } from './clinicDeliveryCredentials.js';
import { createDefaultDispatchPort } from '../adapters/dispatchPort.js';
import type { DeliveryAdapter, OutgoingIntent } from '../../kernel/contracts/index.js';

const ORG_A = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAccess.mockResolvedValue({ mutationAllowed: true });
  mocks.readCredential.mockImplementation(async (_db, key: string) =>
    key === 'clinic_smtp_outbound'
      ? {
          value: {
            host: 'smtp.clinic.test',
            port: 587,
            secure: false,
            user: 'clinic',
            password: 'secret',
            from: 'clinic@example.test',
          },
        }
      : { value: `${key}:secret` },
  );
});

describe('exact-organization clinic delivery credential resolution', () => {
  it('uses only the current organization row and the independent mechanic for every channel', async () => {
    const resolve = createClinicDeliveryCredentialResolver({} as never);
    const results = await runWithOrganizationPrincipal(ORG_A, () =>
      Promise.all([resolve('email'), resolve('smsc'), resolve('telegram'), resolve('max')]),
    );

    expect(results.map((result) => result?.channel)).toEqual([
      'email',
      'smsc',
      'telegram',
      'max',
    ]);
    expect(mocks.resolveAccess.mock.calls.map((call) => call[1])).toEqual([
      { organizationId: ORG_A, mechanic: 'clinic_smtp' },
      { organizationId: ORG_A, mechanic: 'clinic_sms' },
      { organizationId: ORG_A, mechanic: 'clinic_telegram_bot' },
      { organizationId: ORG_A, mechanic: 'clinic_max_bot' },
    ]);
    // Every channel goes through the capability, and every call carries the exact current org —
    // the direct settings-table read this replaced was a hard 42501 for this app's roles.
    expect(mocks.readCredential.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ['clinic_smtp_outbound', ORG_A],
      ['clinic_smsc_api_key', ORG_A],
      ['clinic_telegram_bot_token', ORG_A],
      ['clinic_max_bot_api_key', ORG_A],
    ]);
  });

  it('does not read a credential when the clinic mechanic is unavailable', async () => {
    mocks.resolveAccess.mockResolvedValue({ mutationAllowed: false });
    const resolve = createClinicDeliveryCredentialResolver({} as never);

    await expect(
      runWithOrganizationPrincipal(ORG_A, () => resolve('telegram')),
    ).resolves.toBeNull();
    expect(mocks.readCredential).not.toHaveBeenCalled();
  });

  it('passes the resolved exact-org credential to a clinic-required dispatch instead of platform fallback', async () => {
    const resolve = createClinicDeliveryCredentialResolver({} as never);
    const send = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const dispatch = createDefaultDispatchPort({
      adapters: [adapter],
      resolveClinicDeliveryCredential: resolve,
    });

    await runWithOrganizationPrincipal(ORG_A, () => dispatch.dispatchOutgoing({
      type: 'message.send',
      payload: { recipient: { chatId: 42 }, message: { text: 'hello' }, delivery: {
        channels: ['telegram'], senderScope: 'clinic_required',
      } },
      meta: {
        eventId: 'clinic-credential-test', occurredAt: '2026-08-16T00:00:00.000Z', source: 'telegram',
        outboundMessageClass: 'broadcast_event', outboundCapability: 'clinic_delivery',
      },
    }));

    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0]?.[0].payload as { delivery: { clinicCredential?: unknown } }).delivery)
      .toMatchObject({ clinicCredential: { channel: 'telegram', botToken: 'clinic_telegram_bot_token:secret' } });
  });
});
