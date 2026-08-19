import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  after: () => {
    throw new Error('after() was called outside a request scope');
  },
}));
vi.mock('@bersoncare/db-principal', () => ({ getCurrentCorrelationIdHeader: () => ({}) }));
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorApiUrl: async () => 'https://integrator.invalid',
  getIntegratorWebhookSecret: async () => 'secret-secret-secret-secret-32ch',
}));

import { createBookingSyncPort } from './bookingM2mApi';

function bookingEvent(eventType: 'booking.created' | 'booking.cancelled') {
  return {
    eventType,
    idempotencyKey: `${eventType}:11111111-1111-4111-8111-111111111111`,
    payload: {
      organizationId: '10000000-0000-4000-8000-000000000001',
      bookingId: '11111111-1111-4111-8111-111111111111',
      userId: '30000000-0000-4000-8000-000000000003',
      bookingType: 'in_person' as const,
      category: 'general' as const,
      slotStart: '2027-01-02T12:00:00.000Z',
      slotEnd: '2027-01-02T12:30:00.000Z',
      contactName: 'Пациент',
      contactPhone: '+79990000000',
    },
  };
}

/** Собирает отложенную работу вместо того, чтобы дать ей выполниться внутри запроса. */
function capturingDefer() {
  const pending: (() => Promise<void>)[] = [];
  return {
    defer: async (work: () => Promise<void>) => {
      pending.push(work);
    },
    runDeferred: async () => {
      for (const work of pending.splice(0)) await work();
    },
    get count() {
      return pending.length;
    },
  };
}

describe('событие записи не держит человека на линии', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['booking.created', 'booking.cancelled'] as const)(
    '%s: человек получает ответ до того, как интегратора вообще позвали — а событие всё равно уходит',
    async (eventType) => {
      const fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const deferred = capturingDefer();

      await createBookingSyncPort({ defer: deferred.defer }).emitBookingEvent(
        bookingEvent(eventType),
      );

      // Вызов вернулся, а интегратора никто не звал: три секунды лестницы повторов человек
      // больше не ждёт, потому что ждать нечего.
      expect(fetchMock).not.toHaveBeenCalled();

      await deferred.runDeferred();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
      expect(url).toBe('https://integrator.invalid/api/bersoncare/booking/lifecycle-event');
      expect(JSON.parse(String(init.body))).toMatchObject({
        eventType,
        idempotencyKey: bookingEvent(eventType).idempotencyKey,
      });
    },
  );

  it('интегратор недоступен — человек всё равно получает свою запись, а отказ назван в журнале', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 502 })),
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const deferred = capturingDefer();

    await expect(
      createBookingSyncPort({ defer: deferred.defer }).emitBookingEvent(
        bookingEvent('booking.created'),
      ),
    ).resolves.toBeUndefined();

    await expect(deferred.runDeferred()).resolves.toBeUndefined();
    expect(errors.mock.calls.at(-1)?.[1]).toMatchObject({
      event: 'booking_lifecycle_emit_failed',
      eventType: 'booking.created',
    });
  });

  it('вызывающий, который потребляет отказ, по-прежнему его получает', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'nope' }), { status: 400 })),
    );

    await expect(
      createBookingSyncPort().emitBookingEvent({
        ...bookingEvent('booking.created'),
        waitForDelivery: true,
      }),
    ).rejects.toThrow('nope');
  });
});
