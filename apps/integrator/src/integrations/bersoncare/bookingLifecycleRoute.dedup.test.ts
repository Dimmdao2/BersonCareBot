import { beforeEach, describe, expect, it, vi } from 'vitest';

const { enqueueMessageRetryJob, cancelPendingBookingReminderJobsByBookingId } = vi.hoisted(() => ({
  enqueueMessageRetryJob: vi.fn(async () => undefined),
  cancelPendingBookingReminderJobsByBookingId: vi.fn(async () => undefined),
}));

vi.mock('../../infra/db/client.js', () => ({ createDbPort: vi.fn(() => ({})) }));
vi.mock('../../infra/operatorIncident/operatorHealthAlertConfigIntegrator.js', () => ({
  loadAdminMessengerIdLists: vi.fn(async () => ({ telegram: ['777'], max: [] })),
}));
vi.mock('../../infra/db/repos/jobQueue.js', () => ({
  cancelPendingBookingReminderJobsByBookingId,
  enqueueMessageRetryJob,
}));
vi.mock('../../infra/adapters/deliveryTargetsPort.js', () => ({
  createDeliveryTargetsPort: vi.fn(() => ({
    getTargetsByPhone: vi.fn(async () => ({ channelBindings: { telegramId: '123' } })),
  })),
}));
vi.mock('../max/maxRecipient.js', () => ({ maxUserRecipient: vi.fn((id: string) => ({ id })) }));
vi.mock('../../config/appTimezone.js', () => ({
  getAppDisplayTimezone: vi.fn(async () => 'UTC'),
}));
vi.mock('../google-calendar/sync.js', () => ({
  syncCanonicalAppointmentToCalendar: vi.fn(async () => undefined),
}));

import type {
  BookingLifecycleEventValidated,
  BookingLifecyclePayloadValidated,
} from './bookingLifecycleSchema.js';
import type { DispatchPort, IdempotencyPort } from '../../kernel/contracts/index.js';

function payload(): BookingLifecyclePayloadValidated {
  return {
    bookingId: '11111111-1111-1111-1111-111111111111',
    userId: 'user-1',
    bookingType: 'in_person',
    category: 'general',
    slotStart: '2027-01-02T12:00:00.000Z',
    slotEnd: '2027-01-02T12:30:00.000Z',
    contactName: 'Пациент',
    contactPhone: '+79990000000',
  } as BookingLifecyclePayloadValidated;
}

function event(): BookingLifecycleEventValidated {
  return { eventType: 'booking.created', payload: payload() } as BookingLifecycleEventValidated;
}

function fakeDispatchPort(): DispatchPort & { dispatchOutgoing: ReturnType<typeof vi.fn> } {
  return { dispatchOutgoing: vi.fn(async () => ({})) } as unknown as DispatchPort & {
    dispatchOutgoing: ReturnType<typeof vi.fn>;
  };
}

/** Simulates the store `createPostgresIdempotencyPort` backs onto: a table row, not process memory. */
function fakePersistentIdempotencyPort(): IdempotencyPort {
  const store = new Map<string, number>();
  return {
    tryAcquire: async (key: string) => {
      if (store.has(key)) return false;
      store.set(key, 1);
      return true;
    },
    release: async (key: string) => {
      store.delete(key);
    },
  };
}

// D34 made idempotencyPort a mandatory dependency (bookingLifecycleRoute.ts:43,565) and deleted the
// in-memory dedup fallback this describe used to cover for "owner fork #2" — calling
// handleBookingLifecycleEvent without a port is now a type error (see the D34 describe block in
// bookingLifecycleRoute.d14.test.ts), not a silent in-process-only dedup. Only the still-live
// persistent-port scenario remains here.
describe('D20 item 16: booking-lifecycle event dedup — persistent idempotency port', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('with a persistent idempotency port (the actual di.ts wiring since 2026-07-14), a duplicate event is dropped even after a process restart', async () => {
    const persistentPort = fakePersistentIdempotencyPort();

    const first = await import('./bookingLifecycleRoute.js');
    const send1 = fakeDispatchPort();
    await first.handleBookingLifecycleEvent(event(), send1, { idempotencyPort: persistentPort });
    expect(send1.dispatchOutgoing).toHaveBeenCalled();

    // Simulate a process restart: fresh module instance means a fresh in-memory dedup Map,
    // but the SAME external persistent store survives — exactly like Postgres would.
    vi.resetModules();
    const second = await import('./bookingLifecycleRoute.js');
    const send2 = fakeDispatchPort();
    await second.handleBookingLifecycleEvent(event(), send2, { idempotencyPort: persistentPort });
    expect(send2.dispatchOutgoing).not.toHaveBeenCalled();
  });
});
