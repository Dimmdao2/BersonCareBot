import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  notifyStaff: vi.fn(async (_input: Record<string, unknown>, _deps: unknown) => ({
    telegramDelivered: 0,
    maxDelivered: 0,
    pushDelivered: 1,
  })),
}));

vi.mock('@/config/env', () => ({ env: { APP_BASE_URL: 'https://app.example.test' } }));
vi.mock('@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff', () => ({
  notifyDoctorPatientMessageToStaff: fakes.notifyStaff,
}));

import { notifyDoctorPatientMessage } from './notifyDoctorPatientMessage';
import { notifyDoctorPatientProgramNote } from './notifyDoctorPatientProgramNote';

beforeEach(() => vi.clearAllMocks());

describe('doctor messenger notifications', () => {
  it('opens the cabinet without offering the removed bot reply flow', async () => {
    await notifyDoctorPatientMessage(
      {
        organizationId: '00000000-0000-4000-8000-000000000001',
        platformUserId: '00000000-0000-4000-8000-000000000002',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        messageText: 'private message body',
        patientLabel: 'Patient',
        source: 'webapp',
      },
      { staffDeps: {} as never },
    );

    const notification = fakes.notifyStaff.mock.calls[0]?.[0];
    expect(notification).toMatchObject({
      topicCode: 'doctor_patient_messages',
      notificationUrl: 'https://app.example.test/app/doctor/communications?tab=chats&chatId=conversation-1',
    });
    expect(notification).not.toHaveProperty('replyMarkup');
  });

  it('opens the program journal without offering the removed bot reply flow', async () => {
    await notifyDoctorPatientProgramNote(
      {
        organizationId: '00000000-0000-4000-8000-000000000001',
        patientUserId: '00000000-0000-4000-8000-000000000002',
        instanceId: '00000000-0000-4000-8000-000000000003',
        stageItemId: '00000000-0000-4000-8000-000000000004',
        patientLabel: 'Patient',
        exerciseTitle: 'Exercise',
        noteText: 'private note body',
      },
      { staffDeps: {} as never },
    );

    const notification = fakes.notifyStaff.mock.calls[0]?.[0];
    expect(notification).toMatchObject({
      topicCode: 'doctor_patient_program_notes',
      notificationUrl:
        'https://app.example.test/app/doctor/clients/00000000-0000-4000-8000-000000000002/treatment-programs/00000000-0000-4000-8000-000000000003',
    });
    expect(notification).not.toHaveProperty('replyMarkup');
  });
});
