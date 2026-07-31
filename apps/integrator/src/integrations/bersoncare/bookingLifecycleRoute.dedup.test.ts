import { beforeEach, describe, expect, it, vi } from 'vitest';

const { enqueueMessageRetryJob, cancelPendingBookingReminderJobsByBookingId } = vi.hoisted(() => ({
  enqueueMessageRetryJob: vi.fn(async () => undefined),
  cancelPendingBookingReminderJobsByBookingId: vi.fn(async () => undefined),
}));

vi.mock('../../infra/db/client.js', () => ({ createDbPort: vi.fn(() => ({})) }));
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

describe('D20 item 16: booking-lifecycle event dedup — owner fork #2, current behavior locked as-is', () => {
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

  it('without an idempotency port (fallback only), the same event is deduped within one process but replays after a simulated restart — the risk the map calls out, unchanged', async () => {
    const first = await import('./bookingLifecycleRoute.js');
    const send1 = fakeDispatchPort();
    await first.handleBookingLifecycleEvent(event(), send1, {});
    expect(send1.dispatchOutgoing).toHaveBeenCalled();

    // Same process, same module instance: the in-memory Map still holds the key.
    const sendSameProcess = fakeDispatchPort();
    await first.handleBookingLifecycleEvent(event(), sendSameProcess, {});
    expect(sendSameProcess.dispatchOutgoing).not.toHaveBeenCalled();

    // Simulated restart: fresh module instance, fresh in-memory Map — the repeat goes through
    // again. This is exactly the double-reminder risk in owner fork #2; it must not be "fixed"
    // here, only documented as the current, deliberate-until-answered behavior.
    vi.resetModules();
    const second = await import('./bookingLifecycleRoute.js');
    const send2 = fakeDispatchPort();
    await second.handleBookingLifecycleEvent(event(), send2, {});
    expect(send2.dispatchOutgoing).toHaveBeenCalled();
  });
});
