import { describe, expect, it, vi } from 'vitest';
import {
  DeliveryTargetsTenantDeniedError,
  getDeliveryTargetsForIntegrator,
  type DeliveryTargetsApiDeps,
} from './deliveryTargetsApi';
import type { IntegratorDeliveryTargetSnapshot } from './integratorDeliveryTargetsPort';

const USER_ID = 'a0000000-0000-4000-8000-00000000000a';
const ORG_ID = 'd0000000-0000-4000-8000-00000000000d';

function okSnapshot(
  overrides: Partial<Extract<IntegratorDeliveryTargetSnapshot, { ok: true }>> = {},
): IntegratorDeliveryTargetSnapshot {
  return {
    ok: true,
    platformUserId: USER_ID,
    channelPreferences: [],
    topicChannelRows: [],
    emailRecipient: 'patient@example.test',
    emailVerified: true,
    muted: false,
    topicMasterEnabled: true,
    hasWebPushSubscription: true,
    vapidConfigured: true,
    smtpConfigured: true,
    ...overrides,
  };
}

function deps(snapshot: IntegratorDeliveryTargetSnapshot): DeliveryTargetsApiDeps & {
  readSnapshot: ReturnType<typeof vi.fn>;
} {
  const readSnapshot = vi.fn(async () => snapshot);
  return { integratorDeliveryTargets: { readSnapshot }, readSnapshot };
}

const GLOBAL_DISABLED = [
  {
    channelCode: 'email' as const,
    isEnabledForMessages: true,
    isEnabledForNotifications: false,
    isPreferredForAuth: false,
  },
  {
    channelCode: 'web_push' as const,
    isEnabledForMessages: true,
    isEnabledForNotifications: false,
    isPreferredForAuth: false,
  },
];

describe('D21 platform-user delivery target resolution', () => {
  it('selects verified email and Web Push through the canonical resolver when providers exist', async () => {
    const result = await getDeliveryTargetsForIntegrator(
      { platformUserId: USER_ID, organizationId: ORG_ID, topic: 'appointment_reminders' },
      deps(okSnapshot()),
    );
    expect(result?.resolution?.selectedChannels).toEqual(['web_push', 'email']);
    expect(result?.emailRecipient).toBe('patient@example.test');
  });

  it('returns provider skip reasons instead of selecting unavailable email and Web Push', async () => {
    const result = await getDeliveryTargetsForIntegrator(
      { platformUserId: USER_ID, organizationId: ORG_ID, topic: 'appointment_reminders' },
      deps(okSnapshot({ vapidConfigured: false, smtpConfigured: false })),
    );
    expect(result?.resolution?.selectedChannels).toEqual([]);
    expect(result?.resolution?.skippedChannels).toEqual(
      expect.arrayContaining([
        { channel: 'web_push', reason: 'vapid_missing' },
        { channel: 'email', reason: 'provider_disabled' },
      ]),
    );
    expect(result?.emailRecipient).toBeUndefined();
  });

  it('honors global channel disables after provider availability is established', async () => {
    const result = await getDeliveryTargetsForIntegrator(
      { platformUserId: USER_ID, organizationId: ORG_ID, topic: 'appointment_reminders' },
      deps(okSnapshot({ channelPreferences: GLOBAL_DISABLED })),
    );
    expect(result?.resolution?.selectedChannels).toEqual([]);
    expect(result?.resolution?.skippedChannels).toEqual(
      expect.arrayContaining([
        { channel: 'web_push', reason: 'disabled_by_user_global' },
        { channel: 'email', reason: 'disabled_by_user_global' },
      ]),
    );
  });

  it('refuses to resolve a platform user outside the signed organization', async () => {
    await expect(
      getDeliveryTargetsForIntegrator(
        { platformUserId: USER_ID, organizationId: ORG_ID, topic: 'appointment_reminders' },
        deps({ ok: false, code: 'delivery_target_outside_organization' }),
      ),
    ).rejects.toBeInstanceOf(DeliveryTargetsTenantDeniedError);
  });

  it('refuses a delivery target whose integrator identity does not match the signed one', async () => {
    await expect(
      getDeliveryTargetsForIntegrator(
        { platformUserId: USER_ID, organizationId: ORG_ID, integratorUserId: '77' },
        deps({ ok: false, code: 'delivery_target_identity_mismatch' }),
      ),
    ).rejects.toBeInstanceOf(DeliveryTargetsTenantDeniedError);
  });

  it('reports "no such target" as an absent audience, not as a tenant denial', async () => {
    const result = await getDeliveryTargetsForIntegrator(
      { phone: '+79990000000', organizationId: ORG_ID },
      deps({ ok: false, code: 'delivery_target_not_found' }),
    );
    expect(result).toBeNull();
  });

  it('sends the whole selector to one declared root instead of resolving identity in TypeScript', async () => {
    const wired = deps(okSnapshot({ telegramId: '4242' }));
    const result = await getDeliveryTargetsForIntegrator(
      { phone: '8 999 000-00-00', organizationId: ORG_ID },
      wired,
    );
    expect(wired.readSnapshot).toHaveBeenCalledTimes(1);
    expect(wired.readSnapshot.mock.calls[0]?.[0]).toMatchObject({
      organizationId: ORG_ID,
      phoneNormalized: '+79990000000',
    });
    // Без темы действует прежнее правило: глобальное предпочтение, а не матрица тем.
    expect(result?.channelBindings).toEqual({ telegramId: '4242' });
    expect(result?.resolution).toBeUndefined();
  });
});
