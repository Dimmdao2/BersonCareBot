import { describe, expect, it, vi } from 'vitest';
import { defaultOperatorHealthAlertConfig } from '@/modules/operator-alerts/operatorHealthAlertConfig';
import {
  prepareOperatorHealthDigestDeliveries,
  resolveOperatorHealthDigestWebPushRecipients,
} from './prepareOperatorHealthDigestDeliveries';

describe('prepareOperatorHealthDigestDeliveries', () => {
  it('materializes only enabled channels and unique recipients with stable per-recipient event ids', () => {
    const config = defaultOperatorHealthAlertConfig();
    config.channels.digest.telegram = true;
    config.channels.digest.max = false;
    config.channels.digest.sms = false;
    config.channels.digest.email = true;
    config.channels.digest.web_push = true;
    const input = {
      localDate: '2026-10-25',
      occurredAt: '2026-10-25T08:00:00.000Z',
      lines: ['Сводка', 'Всё в порядке'],
      title: 'Здоровье системы',
      url: '/app/admin/system-health',
      config,
      recipients: {
        telegram: ['123', '123'],
        max: ['disabled'],
        sms: ['disabled'],
        email: ['admin@example.test'],
        web_push: ['user-id'],
      },
    };
    const first = prepareOperatorHealthDigestDeliveries(input);
    const second = prepareOperatorHealthDigestDeliveries(input);
    expect(first.map(({ channel }) => channel)).toEqual(['telegram', 'email', 'web_push']);
    expect(first.map(({ eventId }) => eventId)).toEqual(second.map(({ eventId }) => eventId));
    expect(new Set(first.map(({ eventId }) => eventId)).size).toBe(3);
    expect(
      first.every(({ eventId }) => eventId.startsWith('operator-health-digest:2026-10-25:')),
    ).toBe(true);
  });

  it('excludes disabled or unsubscribed canonical global admins', async () => {
    const recipients = await resolveOperatorHealthDigestWebPushRecipients({
      globalAdmins: {
        listActiveGlobalAdminUserIds: async () => ['global-admin', 'disabled', 'unsubscribed'],
      },
      channelPreferences: {
        getPreferences: async (userId) =>
          userId === 'disabled'
            ? [
                {
                  channelCode: 'web_push',
                  isEnabledForMessages: true,
                  isEnabledForNotifications: false,
                  isPreferredForAuth: false,
                },
              ]
            : [],
      },
      webPushSubscriptions: {
        hasAnyForUserId: async (userId) => userId !== 'unsubscribed',
      },
    });
    expect(recipients).toEqual(['global-admin']);
  });

  it('cannot promote an ordinary doctor or clinic-admin membership into the global digest audience', async () => {
    const getPreferences = vi.fn(async () => []);
    const hasAnyForUserId = vi.fn(async () => true);
    const recipients = await resolveOperatorHealthDigestWebPushRecipients({
      globalAdmins: {
        listActiveGlobalAdminUserIds: async () => ['global-admin'],
      },
      channelPreferences: { getPreferences },
      webPushSubscriptions: { hasAnyForUserId },
    });
    expect(recipients).toEqual(['global-admin']);
    expect(getPreferences).toHaveBeenCalledOnce();
    expect(getPreferences).not.toHaveBeenCalledWith('ordinary-doctor');
    expect(getPreferences).not.toHaveBeenCalledWith('clinic-admin-member');
    expect(hasAnyForUserId).toHaveBeenCalledOnce();
    expect(hasAnyForUserId).toHaveBeenCalledWith('global-admin');
  });
});
