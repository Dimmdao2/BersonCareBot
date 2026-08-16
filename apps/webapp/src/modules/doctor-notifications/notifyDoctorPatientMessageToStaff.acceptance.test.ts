import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  relayOutbound: vi.fn(async () => ({ ok: true as const, status: 'accepted' as const })),
  reportEmptyAudience: vi.fn(async () => undefined),
}));

vi.mock('@/modules/messaging/relayOutbound', () => ({ relayOutbound: fakes.relayOutbound }));
vi.mock('@/modules/operator-alerts/emptyAudienceRuntime', () => ({
  reportEmptyAudience: fakes.reportEmptyAudience,
}));

import { notifyDoctorPatientMessageToStaff } from './notifyDoctorPatientMessageToStaff';

beforeEach(() => vi.clearAllMocks());

describe.each(['doctor_patient_messages', 'doctor_patient_program_notes'] as const)(
  '%s patient-origin staff delivery',
  (topicCode) => {
    it('uses only current-patient-organization staff and available ∩ enabled channels', async () => {
      const listActiveStaffUserIds = vi.fn(async () => ['global-fallback-staff']);
      const result = await notifyDoctorPatientMessageToStaff(
        {
          organizationId: 'org-1',
          topicCode,
          messageId: `message-${topicCode}`,
          senderDisplayName: 'Пациент',
          notificationUrl: 'https://app.example.test/message',
        },
        {
          staffUsers: { listActiveStaffUserIds },
          topicChannelPrefs: { listByUserId: vi.fn() },
          channelPreferences: { getPreferences: vi.fn() },
          webPushSubscriptions: { hasAnyForUserId: vi.fn() },
          systemSettings: { getSetting: vi.fn() },
          getChannelBindings: vi.fn(),
          patientStaffNotificationProfiles: {
            listForCurrentPatientOrganization: vi.fn(async () => [
              {
                userId: 'org-1-doctor',
                telegramId: 'telegram-1',
                maxId: 'max-1',
                hasWebPushSubscription: false,
                channelPreferences: [
                  {
                    channelCode: 'telegram',
                    isEnabledForMessages: true,
                    isEnabledForNotifications: false,
                    isPreferredForAuth: false,
                  },
                  {
                    channelCode: 'max',
                    isEnabledForMessages: true,
                    isEnabledForNotifications: true,
                    isPreferredForAuth: false,
                  },
                  {
                    channelCode: 'web_push',
                    isEnabledForMessages: true,
                    isEnabledForNotifications: true,
                    isPreferredForAuth: false,
                  },
                ],
                topicChannelPreferences: [
                  { topicCode, channelCode: 'telegram', isEnabled: true },
                  { topicCode, channelCode: 'max', isEnabled: true },
                  { topicCode, channelCode: 'web_push', isEnabled: true },
                ],
              },
            ]),
          },
        } as unknown as Parameters<typeof notifyDoctorPatientMessageToStaff>[1],
      );

      expect(listActiveStaffUserIds).not.toHaveBeenCalled();
      expect(fakes.relayOutbound).toHaveBeenCalledTimes(1);
      expect(fakes.relayOutbound).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'max', recipient: 'max-1', userId: 'org-1-doctor' }),
      );
      expect(result).toEqual({ telegramDelivered: 0, maxDelivered: 1, pushDelivered: 0 });
    });
  },
);
