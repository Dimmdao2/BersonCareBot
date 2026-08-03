import { describe, expect, it } from 'vitest';
import { prepareAppointmentReminderDeliveries } from './appointmentReminderMaterialization';

const base = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  appointmentId: '20000000-0000-4000-8000-000000000002',
  bookingId: 'legacy-booking-a',
  platformUserId: '30000000-0000-4000-8000-000000000003',
  slotStartIso: '2026-08-05T12:00:00.000Z',
  patientName: 'Пациент',
  reminderPlan: { enabled: true, offsetsMinutes: [120] },
  cancelPending: false,
};

describe('appointment reminder product materialization', () => {
  it('materializes immutable Telegram→MAX ladder and a separate web-push sibling', () => {
    const rows = prepareAppointmentReminderDeliveries(
      base,
      {
        selectedChannels: ['telegram', 'max', 'web_push'],
        telegramId: 'tg-1',
        maxId: 'max-1',
        hasWebPush: true,
      },
      '2026-08-03T00:00:00.000Z',
      'Europe/Moscow',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.messengerLadder?.map((step) => step.channel)).toEqual(['telegram', 'max']);
    expect(rows[0]?.channel).toBe('telegram');
    expect(rows[1]?.channel).toBe('web_push');
    expect(rows[0]?.eventId).not.toBe(rows[1]?.eventId);
  });

  it('preserves the legacy two tries when only one messenger is available', () => {
    const [row] = prepareAppointmentReminderDeliveries(
      base,
      { selectedChannels: ['max'], maxId: 'max-1', hasWebPush: false },
      '2026-08-03T00:00:00.000Z',
      'Europe/Moscow',
    );
    expect(row?.messengerLadder?.map((step) => step.channel)).toEqual(['max', 'max']);
  });

  it('converges lifecycle event types on appointment+slot+due and changes generation on reschedule', () => {
    const audience = { selectedChannels: ['telegram'], telegramId: 'tg-1', hasWebPush: false };
    const created = prepareAppointmentReminderDeliveries(
      base,
      audience,
      '2026-08-03T00:00:00.000Z',
      'Europe/Moscow',
    );
    const payment = prepareAppointmentReminderDeliveries(
      { ...base, bookingId: 'other-lifecycle-id' },
      audience,
      '2026-08-03T01:00:00.000Z',
      'Europe/Moscow',
    );
    const rescheduled = prepareAppointmentReminderDeliveries(
      { ...base, slotStartIso: '2026-08-06T12:00:00.000Z' },
      audience,
      '2026-08-03T01:00:00.000Z',
      'Europe/Moscow',
    );
    expect(created[0]?.eventId).toBe(payment[0]?.eventId);
    expect(rescheduled[0]?.eventId).not.toBe(created[0]?.eventId);
  });

  it('materializes nothing for cancellation, disabled policy, or already-due reminders', () => {
    const audience = { selectedChannels: ['telegram'], telegramId: 'tg-1', hasWebPush: false };
    expect(
      prepareAppointmentReminderDeliveries(
        { ...base, cancelPending: true },
        audience,
        '2026-08-03T00:00:00.000Z',
        'Europe/Moscow',
      ),
    ).toEqual([]);
    expect(
      prepareAppointmentReminderDeliveries(
        { ...base, reminderPlan: { enabled: false, offsetsMinutes: [120] } },
        audience,
        '2026-08-03T00:00:00.000Z',
        'Europe/Moscow',
      ),
    ).toEqual([]);
    expect(
      prepareAppointmentReminderDeliveries(
        base,
        audience,
        '2026-08-06T00:00:00.000Z',
        'Europe/Moscow',
      ),
    ).toEqual([]);
  });
});
