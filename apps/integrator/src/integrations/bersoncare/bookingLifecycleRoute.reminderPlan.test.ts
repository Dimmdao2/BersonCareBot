import { beforeEach, describe, expect, it, vi } from 'vitest';

const { enqueueMessageRetryJob, loggerWarn } = vi.hoisted(() => ({
  enqueueMessageRetryJob: vi.fn(async () => undefined),
  loggerWarn: vi.fn(),
}));

vi.mock('../../infra/db/client.js', () => ({ createDbPort: vi.fn(() => ({})) }));
vi.mock('../../infra/db/repos/jobQueue.js', () => ({
  cancelPendingBookingReminderJobsByBookingId: vi.fn(async () => undefined),
  enqueueMessageRetryJob,
}));
vi.mock('../../infra/adapters/deliveryTargetsPort.js', () => ({
  createDeliveryTargetsPort: vi.fn(() => ({
    getTargetsByPhone: vi.fn(async () => ({ channelBindings: { telegramId: '123' } })),
  })),
}));
vi.mock('../max/maxRecipient.js', () => ({ maxUserRecipient: vi.fn((id: string) => ({ id })) }));
vi.mock('../../infra/observability/logger.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logger: { ...(actual.logger as object), warn: loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } };
});

import { scheduleBookingReminders } from './bookingLifecycleRoute.js';

const slotStartIso = '2027-01-02T12:00:00.000Z';

function scheduledAt(): string[] {
  return (enqueueMessageRetryJob.mock.calls as unknown as [unknown, { firstTryAt: string }][]).map(
    ([, input]) => input.firstTryAt,
  );
}

describe('scheduleBookingReminders reminder plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
  });

  it('puts delivery jobs at the clinic-configured absolute appointment offsets', async () => {
    await scheduleBookingReminders({
      bookingId: 'booking-1',
      slotStartIso,
      phoneNormalized: '+79990000000',
      patientName: 'Пациент',
      timeZone: 'UTC',
      reminderPlan: { enabled: true, offsetsMinutes: [90, 30] },
    });

    expect(enqueueMessageRetryJob).toHaveBeenCalledTimes(2);
    expect(scheduledAt()).toEqual([
      '2027-01-02T10:30:00.000Z',
      '2027-01-02T11:30:00.000Z',
    ]);

    enqueueMessageRetryJob.mockClear();
    await scheduleBookingReminders({
      bookingId: 'booking-2',
      slotStartIso,
      phoneNormalized: '+79990000000',
      patientName: 'Пациент',
      timeZone: 'UTC',
      reminderPlan: { enabled: true, offsetsMinutes: [45] },
    });
    expect(scheduledAt()).toEqual([
      '2027-01-02T11:15:00.000Z',
    ]);
  });

  it('does not put any delivery job when the clinic disables appointment reminders', async () => {
    await scheduleBookingReminders({
      bookingId: 'booking-disabled',
      slotStartIso,
      phoneNormalized: '+79990000000',
      patientName: 'Пациент',
      timeZone: 'UTC',
      reminderPlan: { enabled: false, offsetsMinutes: [90, 30] },
    });

    expect(enqueueMessageRetryJob).not.toHaveBeenCalled();
  });

  it('D13b: puts no delivery job when no plan is given — there is no 24h/2h fallback left', async () => {
    await scheduleBookingReminders({
      bookingId: 'booking-no-plan',
      slotStartIso,
      phoneNormalized: '+79990000000',
      patientName: 'Пациент',
      timeZone: 'UTC',
    });

    expect(enqueueMessageRetryJob).not.toHaveBeenCalled();
  });

  // D13b: рез констант 24ч/2ч сделан. Событие БЕЗ плана не должно тихо не поставить ничего —
  // план предупреждает дословно: «ошибок в логах не будет, деплой останется зелёным, обнаружится по неявкам».
  it('warns visibly when the webapp sent no reminder plan at all', async () => {
    await scheduleBookingReminders({
      bookingId: 'booking-no-plan',
      slotStartIso,
      phoneNormalized: '+79990000000',
      patientName: 'Пациент',
      timeZone: 'UTC',
    });
    expect(scheduledAt()).toEqual([]);
    expect(loggerWarn).toHaveBeenCalledTimes(1);
    const [payload] = loggerWarn.mock.calls[0] as [{ reason: string; severity: string }];
    expect(payload.reason).toBe('no_reminder_plan');
    expect(payload.severity).toBe('user_facing');
  });
});
