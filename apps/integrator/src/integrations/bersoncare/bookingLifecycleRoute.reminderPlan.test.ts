import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerWarn } = vi.hoisted(() => ({ loggerWarn: vi.fn() }));
vi.mock('../../infra/observability/logger.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: {
      ...(actual.logger as object),
      warn: loggerWarn,
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

import { scheduleBookingReminders } from './bookingLifecycleRoute.js';
import type { WebappEventsPort } from '../../kernel/contracts/index.js';

const slotStartIso = '2027-01-02T12:00:00.000Z';
const materialize = vi.fn<NonNullable<WebappEventsPort['materializeAppointmentReminders']>>(
  async () => ({ ok: true, status: 200, current: true, inserted: 2 }),
);
const webappEventsPort: WebappEventsPort = {
  materializeAppointmentReminders: materialize,
};

async function schedule(reminderPlan?: { enabled: boolean; offsetsMinutes: number[] }) {
  await scheduleBookingReminders({
    organizationId: '10000000-0000-4000-8000-000000000001',
    appointmentId: '20000000-0000-4000-8000-000000000002',
    platformUserId: '30000000-0000-4000-8000-000000000003',
    bookingId: 'booking-1',
    slotStartIso,
    phoneNormalized: '+79990000000',
    patientName: 'Пациент',
    timeZone: 'UTC',
    webappEventsPort,
    ...(reminderPlan ? { reminderPlan } : {}),
  });
}

describe('scheduleBookingReminders unified materializer handoff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hands the exact clinic plan to webapp and never writes the legacy queue', async () => {
    await schedule({ enabled: true, offsetsMinutes: [90, 30] });
    expect(materialize).toHaveBeenCalledTimes(1);
    const [{ body, idempotencyKey }] = materialize.mock.calls[0]!;
    expect(JSON.parse(body)).toMatchObject({
      appointmentId: '20000000-0000-4000-8000-000000000002',
      slotStartIso,
      reminderPlan: { enabled: true, offsetsMinutes: [90, 30] },
      cancelPending: false,
    });
    expect(idempotencyKey).toContain('20000000-0000-4000-8000-000000000002');
  });

  it('hands disabled and absent plans to the same product-side terminalization seam', async () => {
    await schedule({ enabled: false, offsetsMinutes: [90] });
    await schedule();
    expect(materialize).toHaveBeenCalledTimes(2);
    expect(JSON.parse(materialize.mock.calls[0]![0].body).reminderPlan).toEqual({
      enabled: false,
      offsetsMinutes: [90],
    });
    expect(JSON.parse(materialize.mock.calls[1]![0].body).reminderPlan).toEqual({
      enabled: false,
      offsetsMinutes: [],
    });
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'no_reminder_plan', severity: 'user_facing' }),
      expect.any(String),
    );
  });

  it('fails the lifecycle attempt when the durable materializer rejects the handoff', async () => {
    materialize.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(schedule({ enabled: true, offsetsMinutes: [30] })).rejects.toThrow(
      'APPOINTMENT_REMINDER_MATERIALIZATION_FAILED:503',
    );
  });
});
