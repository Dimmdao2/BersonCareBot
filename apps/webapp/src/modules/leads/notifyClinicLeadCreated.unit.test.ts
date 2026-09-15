import { describe, expect, it, vi } from 'vitest';
import { notifyClinicLeadCreated, type NotifyClinicLeadCreatedDeps } from './notifyClinicLeadCreated';
import type { Lead } from './types';

const relayOutbound = vi.fn(async (_params: Record<string, unknown>) => ({ ok: true as const }));
vi.mock('@/modules/messaging/relayOutbound', () => ({
  relayOutbound: (params: Record<string, unknown>) => relayOutbound(params),
}));

const lead = (organizationId: string): Lead =>
  ({
    id: 'lead-1',
    organizationId,
    platformUserId: 'applicant-1',
    submittedEmail: 'person@example.com',
    messageText: 'Нужна консультация',
    status: 'new',
    sourceSurface: 'public_page',
  }) as Lead;

/**
 * Oracle — живой замер против `bcb_webapp_dev`, записанный в
 * `docs/_TODO/AUDIT_L4_CLINIC_NOTIFICATION_CORRECTION_2026-09-15.md`: под принципалом двери заявки
 * (класс `tenant_service`) КАЖДОЕ прямое чтение предпочтений, привязок, подписок и общего списка
 * персонала отвечает `Missing declared webapp port capability: tenant_service`. Здесь этот отказ
 * подан ровно теми же портами, какие даёт `buildAppDeps`.
 *
 * Дорогая молчаливая поломка: заявка записана, посетитель увидел «принято», а уведомление умерло
 * на первом же таком чтении — и с `void … .catch(log)` умерло МОЛЧА. Клиника не узнаёт о заявке
 * никогда, и наружу это не видно ничем.
 *
 * Наблюдаемый конец цепочки — сама отправка: `relayOutbound` есть предписанный §8.8 способ
 * уведомить клинику и последний side effect этого пути.
 */
describe('уведомление клиники о новой заявке', () => {
  function refuse(port: string) {
    return async () => {
      throw new Error(`Missing declared webapp port capability: tenant_service (${port})`);
    };
  }

  it('доходит до отправки, не читая закрытых для двери заявки таблиц персонала', async () => {
    relayOutbound.mockClear();
    const deps = {
      clinicLeadNotificationProfiles: {
        listForLeadOrganization: async () => [
          {
            userId: 'admin-of-own-clinic',
            telegramId: '100500',
            maxId: null,
            hasWebPushSubscription: false,
            channelPreferences: [],
            topicChannelPreferences: [],
          },
        ],
      },
      staffUsers: { listActiveStaffUserIds: refuse('staffUsers') },
      topicChannelPrefs: { listByUserId: refuse('topicChannelPrefs') },
      channelPreferences: { getPreferences: refuse('channelPreferences') },
      webPushSubscriptions: { hasAnyForUserId: refuse('webPushSubscriptions') },
      systemSettings: { getSetting: refuse('systemSettings') },
      getChannelBindings: refuse('getChannelBindings'),
    } as unknown as NotifyClinicLeadCreatedDeps;

    await notifyClinicLeadCreated(lead('org-of-this-lead'), deps);

    expect(relayOutbound).toHaveBeenCalledTimes(1);
    expect(relayOutbound.mock.calls[0]?.[0]).toMatchObject({
      channel: 'telegram',
      recipient: '100500',
      organizationId: 'org-of-this-lead',
    });
  });
});
