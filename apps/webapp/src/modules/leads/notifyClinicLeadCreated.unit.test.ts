import { describe, expect, it, vi } from 'vitest';
import { notifyClinicLeadCreated } from './notifyClinicLeadCreated';
import type { Lead } from './types';
import type { NotifyDoctorPatientMessageToStaffDeps } from '@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff';

const relayOutbound = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/modules/messaging/relayOutbound', () => ({ relayOutbound: (...args: unknown[]) => relayOutbound(...(args as [])) }));

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
 * Поломка: аудиторию события «новая заявка» берут не у клиники заявки.
 * Последствие: контакты обратившегося человека уезжают персоналу ЧУЖОЙ организации (§8.8 — старый
 * relay заявок брал глобальные `admin_*_ids`, «что в SaaS адресует не тому»), либо уведомление
 * переучивает общий список персонала и ломает соседей по этому списку.
 *
 * Стена арендатора в самой ВЫБОРКЕ доказывается живой базой
 * (`infra/repos/leadClinicAdminAudience.devDbProof.test.ts`) — здесь проверяется только шов:
 * какой организацией событие спрашивает аудиторию и что оно не трогает общий список.
 */
describe('аудитория уведомления о новой заявке', () => {
  function deps() {
    const listActiveClinicAdminUserIds = vi.fn(async (_organizationId: string) => ['admin-of-own-clinic']);
    const listActiveStaffUserIds = vi.fn(async () => ['кто-угодно-со-всей-платформы']);
    const seen: Array<{ organizationId: string; staffUserIds?: string[] }> = [];
    return {
      seen,
      listActiveClinicAdminUserIds,
      listActiveStaffUserIds,
      value: {
        staffUsers: { listActiveClinicAdminUserIds, listActiveStaffUserIds },
        topicChannelPrefs: { listByUserId: async () => [] },
        channelPreferences: { getPreferences: async () => [] },
        webPushSubscriptions: { hasAnyForUserId: async () => false },
        systemSettings: { getSetting: async () => null },
        getChannelBindings: async () => ({ telegramId: null, maxId: null }),
      } as unknown as NotifyDoctorPatientMessageToStaffDeps,
    };
  }

  it('спрашивает аудиторию у клиники самой заявки', async () => {
    const fakes = deps();
    await notifyClinicLeadCreated(lead('org-of-this-lead'), fakes.value);
    expect(fakes.listActiveClinicAdminUserIds).toHaveBeenCalledWith('org-of-this-lead');
  });

  it('не трогает общий список персонала платформы', async () => {
    const fakes = deps();
    await notifyClinicLeadCreated(lead('org-of-this-lead'), fakes.value);
    // Первая версия Л4 переписала общий `listActiveStaffUserIds` под правило заявок и сломала
    // соседа по этому методу. Событие обязано называть аудиторию само, а не переучивать список.
    expect(fakes.listActiveStaffUserIds).not.toHaveBeenCalled();
  });
});
