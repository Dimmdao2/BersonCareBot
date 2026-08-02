import { describe, expect, it } from 'vitest';
import {
  DeliveryTargetsTenantDeniedError,
  getDeliveryTargetsForIntegrator,
  type DeliveryTargetsApiDeps,
} from './deliveryTargetsApi';

const USER_ID = 'a0000000-0000-4000-8000-00000000000a';
const ORG_ID = 'd0000000-0000-4000-8000-00000000000d';

function deps(providerConfigured: boolean, globalDisabled = false): DeliveryTargetsApiDeps {
  return {
    userByPhonePort: {} as DeliveryTargetsApiDeps['userByPhonePort'],
    identityResolutionPort: {} as DeliveryTargetsApiDeps['identityResolutionPort'],
    preferencesPort: {
      async getPreferences() {
        return globalDisabled
          ? [
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
            ]
          : [];
      },
      async upsertPreference() {
        throw new Error('not used');
      },
      async getBroadcastNotificationFlagsBatch() {
        return new Map();
      },
      async getPreferredAuthChannelCode() {
        return null;
      },
      async setPreferredAuthChannel() {},
    },
    topicChannelPrefsPort: {
      async listByUserId() {
        return [];
      },
      async upsert() {},
    },
    async readReminderNotifyGate() {
      return { muted: false, topicMasterEnabled: true };
    },
    async getProfileEmailFields() {
      return { email: 'patient@example.test', emailVerifiedAt: '2026-08-02T12:00:00.000Z' };
    },
    webPushSubscriptions: {
      async hasAnyForUserId() {
        return true;
      },
    },
    systemSettings: {
      async getSetting(key) {
        if (!providerConfigured) return null;
        if (key === 'web_push_vapid') {
          return {
            key,
            scope: 'admin',
            valueJson: { value: { publicKey: 'public', privateKey: 'private' } },
            updatedAt: '2026-08-02T12:00:00.000Z',
            updatedBy: null,
          };
        }
        if (key === 'smtp_outbound') {
          return {
            key,
            scope: 'admin',
            valueJson: {
              value: {
                host: 'smtp.example.test',
                port: 465,
                secure: true,
                user: 'mailer',
                password: 'secret',
                from: 'care@example.test',
              },
            },
            updatedAt: '2026-08-02T12:00:00.000Z',
            updatedBy: null,
          };
        }
        return null;
      },
    },
    async hasActivePatientEnrollment() {
      return true;
    },
    async findPlatformUserByIntegratorId() {
      return null;
    },
    async getChannelBindings() {
      return {};
    },
  };
}

describe('D21 platform-user delivery target resolution', () => {
  it('selects verified email and Web Push through the canonical resolver when providers exist', async () => {
    const result = await getDeliveryTargetsForIntegrator(
      {
        platformUserId: USER_ID,
        organizationId: ORG_ID,
        topic: 'appointment_reminders',
      },
      deps(true),
    );
    expect(result?.resolution?.selectedChannels).toEqual(['web_push', 'email']);
    expect(result?.emailRecipient).toBe('patient@example.test');
  });

  it('returns provider skip reasons instead of selecting unavailable email and Web Push', async () => {
    const result = await getDeliveryTargetsForIntegrator(
      {
        platformUserId: USER_ID,
        organizationId: ORG_ID,
        topic: 'appointment_reminders',
      },
      deps(false),
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
      {
        platformUserId: USER_ID,
        organizationId: ORG_ID,
        topic: 'appointment_reminders',
      },
      deps(true, true),
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
    const foreign = deps(true);
    foreign.hasActivePatientEnrollment = async () => false;

    await expect(
      getDeliveryTargetsForIntegrator(
        {
          platformUserId: USER_ID,
          organizationId: ORG_ID,
          topic: 'appointment_reminders',
        },
        foreign,
      ),
    ).rejects.toBeInstanceOf(DeliveryTargetsTenantDeniedError);
  });
});
