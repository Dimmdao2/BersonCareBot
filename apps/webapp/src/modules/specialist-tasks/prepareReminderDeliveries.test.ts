import { describe, expect, it } from 'vitest';
import { prepareSpecialistTaskReminderDeliveries } from './prepareReminderDeliveries';
import type { SpecialistTaskRow } from './types';

const task: SpecialistTaskRow = {
  id: '00000000-0000-4000-8000-000000000301',
  organizationId: '00000000-0000-4000-8000-000000000302',
  ownerUserId: '00000000-0000-4000-8000-000000000303',
  patientUserId: '00000000-0000-4000-8000-000000000304',
  title: 'Позвонить пациенту',
  description: null,
  dueAt: '2026-08-04T10:00:00.000Z',
  remindAt: '2026-08-04T09:00:00.000Z',
  isImportant: false,
  completedAt: null,
  reminderSentAt: null,
  createdAt: '2026-08-03T10:00:00.000Z',
  updatedAt: '2026-08-03T10:00:00.000Z',
};

describe('specialist-task ready delivery producer', () => {
  it('materializes selected channel intent, deterministic event id, tenant scope and absolute due time', async () => {
    const deliveries = await prepareSpecialistTaskReminderDeliveries(task, {
      topicChannelPrefs: { listByUserId: async () => [] },
      channelPreferences: { getPreferences: async () => [] },
      webPushSubscriptions: { hasAnyForUserId: async () => false },
      systemSettings: { getSetting: async () => ({ valueJson: { channels: ['telegram', 'email'] } }) },
      getChannelBindings: async () => ({ telegramId: '12345' }),
      getProfileEmail: async () => 'doctor@example.test',
      getProfileEmailVerified: async () => true,
      resolvePatientDisplayName: async () => 'Пациент',
    } as never);

    expect(deliveries).toHaveLength(2);
    expect(deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: task.organizationId,
          channel: 'telegram',
          nextRetryAt: task.remindAt,
          eventId: expect.stringMatching(
            new RegExp(`^specialist-task:${task.id}:${encodeURIComponent(task.remindAt ?? '')}:[0-9a-f]{16}:telegram$`),
          ),
          intent: expect.objectContaining({
            payload: expect.objectContaining({ recipient: { chatId: '12345' } }),
          }),
        }),
        expect.objectContaining({
          channel: 'email',
          intent: expect.objectContaining({
            payload: expect.objectContaining({ recipient: { email: 'doctor@example.test' } }),
          }),
        }),
      ]),
    );
  });

  it('does not manufacture a tenant intent without an organization or a due timestamp', async () => {
    const deliveries = await prepareSpecialistTaskReminderDeliveries(
      { ...task, organizationId: null, remindAt: null },
      {} as never,
    );
    expect(deliveries).toEqual([]);
  });

  it('keeps retries idempotent but versions title and description changes at the same due time', async () => {
    const deps = {
      topicChannelPrefs: { listByUserId: async () => [] },
      channelPreferences: { getPreferences: async () => [] },
      webPushSubscriptions: { hasAnyForUserId: async () => false },
      systemSettings: { getSetting: async () => ({ valueJson: { channels: ['telegram'] } }) },
      getChannelBindings: async () => ({ telegramId: '12345' }),
      getProfileEmail: async () => null,
      getProfileEmailVerified: async () => false,
      resolvePatientDisplayName: async () => 'Пациент',
    } as never;

    const first = await prepareSpecialistTaskReminderDeliveries(task, deps);
    const repeated = await prepareSpecialistTaskReminderDeliveries(task, deps);
    const titleChanged = await prepareSpecialistTaskReminderDeliveries(
      { ...task, title: 'Новый заголовок' },
      deps,
    );
    const descriptionChanged = await prepareSpecialistTaskReminderDeliveries(
      { ...task, description: 'Новое описание' },
      deps,
    );

    expect(repeated.map((delivery) => delivery.eventId)).toEqual(first.map((delivery) => delivery.eventId));
    expect(titleChanged.map((delivery) => delivery.eventId)).not.toEqual(
      first.map((delivery) => delivery.eventId),
    );
    expect(descriptionChanged.map((delivery) => delivery.eventId)).not.toEqual(
      first.map((delivery) => delivery.eventId),
    );
  });
});
