import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDoctorPatientProgramDeepLink,
  buildDoctorPatientProgramNoteNotifyText,
  notifyDoctorPatientProgramNote,
} from './notifyDoctorPatientProgramNote';

vi.mock('@/config/env', () => ({
  env: { APP_BASE_URL: 'https://app.example' },
}));

vi.mock('@/modules/messaging/doctorNotifyTargets', () => ({
  loadDoctorNotifyTargets: vi.fn(),
  relayTextToDoctorTargets: vi.fn(),
}));

vi.mock('@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff', () => ({
  notifyDoctorPatientMessageToStaff: vi.fn(),
}));

import {
  loadDoctorNotifyTargets,
  relayTextToDoctorTargets,
} from '@/modules/messaging/doctorNotifyTargets';
import {
  notifyDoctorPatientMessageToStaff,
  type NotifyDoctorPatientMessageToStaffDeps,
} from '@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff';
import type { ChannelPreferencesPort } from '@/modules/channel-preferences/ports';
import type { WebPushSubscriptionsPort } from '@/modules/web-push/ports';

const patientUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const instanceId = '11111111-1111-4111-8111-111111111111';
const stageItemId = '22222222-2222-4222-8222-222222222222';
const staffDeps: NotifyDoctorPatientMessageToStaffDeps = {
  staffUsers: { listActiveStaffUserIds: async () => ['doc-1'] },
  topicChannelPrefs: { listByUserId: async () => [], upsert: async () => {} },
  channelPreferences: { getPreferences: async () => [] } as unknown as ChannelPreferencesPort,
  webPushSubscriptions: {
    hasAnyForUserId: async () => true,
    listActiveByUserId: async () => [],
    deleteByEndpointIfExists: async () => true,
  } as unknown as WebPushSubscriptionsPort,
  systemSettings: { getSetting: async () => null },
  getChannelBindings: async () => ({ telegramId: '123' }),
};

describe('notifyDoctorPatientProgramNote', () => {
  beforeEach(() => {
    vi.mocked(loadDoctorNotifyTargets).mockReset();
    vi.mocked(relayTextToDoctorTargets).mockReset();
    vi.mocked(notifyDoctorPatientMessageToStaff).mockReset();
    vi.mocked(loadDoctorNotifyTargets).mockResolvedValue({
      telegram: ['123'],
      max: [],
    });
    vi.mocked(relayTextToDoctorTargets).mockResolvedValue(undefined);
    vi.mocked(notifyDoctorPatientMessageToStaff).mockResolvedValue({
      telegramDelivered: 0,
      maxDelivered: 0,
      pushDelivered: 1,
    });
  });

  it('buildDoctorPatientProgramDeepLink uses app base when configured', () => {
    const link = buildDoctorPatientProgramDeepLink({
      patientUserId,
      instanceId,
      appBaseUrl: 'https://app.example/',
    });
    expect(link).toBe(
      `https://app.example/app/doctor/clients/${patientUserId}/treatment-programs/${instanceId}`,
    );
  });

  it('buildDoctorPatientProgramDeepLink falls back to relative path without base', () => {
    const link = buildDoctorPatientProgramDeepLink({ patientUserId, instanceId, appBaseUrl: '' });
    expect(link).toBe(`/app/doctor/clients/${patientUserId}/treatment-programs/${instanceId}`);
  });

  it('buildDoctorPatientProgramNoteNotifyText includes label, title and note preview', () => {
    const text = buildDoctorPatientProgramNoteNotifyText({
      patientLabel: 'Иван',
      deepLink: 'https://app.example/p',
    });
    expect(text).toBe('новое сообщение от Иван\n\nhttps://app.example/p');
    expect(text).not.toContain('Болит колено');
  });

  it('notifyDoctorPatientProgramNote uses staff topic delivery when staffDeps provided', async () => {
    await notifyDoctorPatientProgramNote(
      {
        organizationId: '11111111-1111-4111-8111-111111111111',
        patientUserId,
        instanceId,
        stageItemId,
        patientLabel: 'Иван',
        exerciseTitle: 'Присед',
        noteText: 'Комментарий',
      },
      {
        staffDeps,
      },
    );
    expect(notifyDoctorPatientMessageToStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        topicCode: 'doctor_patient_program_notes',
        messageId: expect.stringMatching(/^patient-program-note:/),
        senderDisplayName: 'Иван',
        notificationUrl: expect.stringContaining(`/app/doctor/clients/${patientUserId}`),
        replyMarkup: expect.objectContaining({
          inline_keyboard: [[{ text: 'Ответить', callback_data: `program_reply:${stageItemId}` }]],
        }),
      }),
      staffDeps,
    );
    expect(relayTextToDoctorTargets).not.toHaveBeenCalled();
  });

  it('notifyDoctorPatientProgramNote falls back to legacy relay without staffDeps', async () => {
    await notifyDoctorPatientProgramNote({
      organizationId: '11111111-1111-4111-8111-111111111111',
      patientUserId,
      instanceId,
      stageItemId,
      patientLabel: 'Иван',
      exerciseTitle: 'Присед',
      noteText: 'Комментарий',
    });
    expect(relayTextToDoctorTargets).toHaveBeenCalledWith(
      expect.stringMatching(/^patient-program-note:/),
      { telegram: ['123'], max: [] },
      expect.stringContaining('новое сообщение от Иван'),
      'patient-program-note',
      expect.objectContaining({
        inline_keyboard: [[{ text: 'Ответить', callback_data: `program_reply:${stageItemId}` }]],
      }),
    );
    expect(vi.mocked(relayTextToDoctorTargets).mock.calls[0]?.[2]).not.toContain('Комментарий');
    expect(notifyDoctorPatientMessageToStaff).not.toHaveBeenCalled();
  });

  it('notifyDoctorPatientProgramNote skips relay when no targets and no staffDeps', async () => {
    vi.mocked(loadDoctorNotifyTargets).mockResolvedValue({ telegram: [], max: [] });
    await notifyDoctorPatientProgramNote({
      organizationId: '11111111-1111-4111-8111-111111111111',
      patientUserId,
      instanceId,
      stageItemId,
      patientLabel: 'Иван',
      exerciseTitle: 'Присед',
      noteText: 'Комментарий',
    });
    expect(relayTextToDoctorTargets).not.toHaveBeenCalled();
  });
});
