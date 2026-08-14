import { describe, expect, it } from 'vitest';
import { COMMUNICATIONS_TABS, communicationsTabFromQuery } from './doctorCommunicationsTabs';
import { loadDoctorCommunicationsBadges } from './loadDoctorCommunicationsBadges';

describe('doctor communications after standalone intake removal', () => {
  it('falls back to chats for a retired intake bookmark and exposes no intake tab', () => {
    expect(communicationsTabFromQuery('intake')).toBe('chats');
    expect(COMMUNICATIONS_TABS.map((tab) => tab.label)).toEqual([
      'Чаты',
      'Комментарии',
      'Рассылки',
    ]);
  });

  it('keeps the unread-chat badge after the separate intake counter is removed', async () => {
    await expect(
      loadDoctorCommunicationsBadges({
        messaging: { doctorSupport: { unreadFromUsers: async () => 3 } },
      }, {
        organizationId: '11111111-1111-4111-8111-111111111111',
        visibilityActor: {
          membershipRole: 'doctor',
          specialistId: '22222222-2222-4222-8222-222222222222',
          canManageAllSpecialists: false,
        },
      }),
    ).resolves.toEqual({ chats: 3 });
  });
});
