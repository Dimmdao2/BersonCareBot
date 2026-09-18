import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 19.08: пациентское сообщение о созданной записи ставит в очередь сам вебапп
 * («Запись делает вебапп»). Проверяется поведение, видимое человеку: приходит ли пациенту второе,
 * такое же сообщение от интегратора, и не потерял ли при этом врач своё.
 */

const { getTargetsByPhoneMock, loadAdminMessengerIdListsMock } = vi.hoisted(() => ({
  getTargetsByPhoneMock: vi.fn(async () => ({ channelBindings: { telegramId: '123' } })),
  loadAdminMessengerIdListsMock: vi.fn(async () => ({ telegram: ['777'], max: [] })),
}));

vi.mock('../../infra/db/client.js', () => ({ createDbPort: vi.fn(() => ({})) }));
vi.mock('../../infra/operatorIncident/operatorHealthAlertConfigIntegrator.js', () => ({
  loadAdminMessengerIdLists: loadAdminMessengerIdListsMock,
}));
vi.mock('../../infra/adapters/deliveryTargetsPort.js', () => ({
  createDeliveryTargetsPort: vi.fn(() => ({ getTargetsByPhone: getTargetsByPhoneMock })),
}));
vi.mock('../max/maxRecipient.js', () => ({ maxUserRecipient: vi.fn((id: string) => ({ id })) }));
vi.mock('../../config/appTimezone.js', () => ({
  getAppDisplayTimezone: vi.fn(async () => 'UTC'),
}));
vi.mock('../google-calendar/sync.js', () => ({
  syncCanonicalAppointmentToCalendar: vi.fn(async () => undefined),
}));

import { handleBookingLifecycleEvent } from './bookingLifecycleRoute.js';
import { parseBookingLifecycleEvent } from './bookingLifecycleSchema.js';
import { createInMemoryIdempotencyPort } from '../../infra/db/repos/idempotencyKeys.js';
import type { DispatchPort, WebappEventsPort } from '../../kernel/contracts/index.js';

let bookingCounter = 0;

function basePayload() {
  bookingCounter += 1;
  return {
    bookingId: `11111111-1111-1111-1111-11111111${String(bookingCounter).padStart(4, '0')}`,
    organizationId: '10000000-0000-4000-8000-000000000001',
    canonicalAppointmentId: '20000000-0000-4000-8000-000000000002',
    userId: '30000000-0000-4000-8000-000000000003',
    bookingType: 'in_person' as const,
    category: 'general' as const,
    slotStart: '2027-01-02T12:00:00.000Z',
    slotEnd: '2027-01-02T12:30:00.000Z',
    contactName: 'Пациент',
    contactPhone: '+79990000000',
  };
}

function fakeWebappEventsPort(): WebappEventsPort {
  return {
    notifyPatientWebPush: vi.fn(async () => ({ ok: true, status: 200 })),
    materializeAppointmentReminders: vi.fn(async () => ({ ok: true, status: 200 })),
  } as unknown as WebappEventsPort;
}

function recipientsOf(dispatch: ReturnType<typeof vi.fn>): string[] {
  return dispatch.mock.calls.map((call) => {
    const intent = call[0] as { payload: { recipient: Record<string, unknown> } };
    return String(intent.payload.recipient.chatId ?? intent.payload.recipient.id ?? '');
  });
}

describe('booking.created: кто получает сообщение от интегратора', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('вебапп уже поставил пациентское сообщение — интегратор второго не шлёт, врач своё получает', async () => {
    const dispatchOutgoing = vi.fn(async () => ({}));
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.created',
        idempotencyKey: 'suppressed',
        payload: { ...basePayload(), suppressPatientNotification: true },
      },
      { dispatchOutgoing } as unknown as DispatchPort,
      {
        idempotencyPort: createInMemoryIdempotencyPort(),
        webappEventsPort: fakeWebappEventsPort(),
      },
    );

    // Пациент (telegram 123) от интегратора ничего не получает — его сообщение уже в очереди.
    expect(recipientsOf(dispatchOutgoing)).not.toContain('123');
    // Врач (telegram 777) получает своё — оно с этого пути не уходило.
    expect(recipientsOf(dispatchOutgoing)).toContain('777');
  });

  it('отправитель без флага получает прежнее поведение: пациент и врач получают оба', async () => {
    const dispatchOutgoing = vi.fn(async () => ({}));
    await handleBookingLifecycleEvent(
      { eventType: 'booking.created', idempotencyKey: 'legacy', payload: basePayload() },
      { dispatchOutgoing } as unknown as DispatchPort,
      {
        idempotencyPort: createInMemoryIdempotencyPort(),
        webappEventsPort: fakeWebappEventsPort(),
      },
    );

    expect(recipientsOf(dispatchOutgoing)).toContain('123');
    expect(recipientsOf(dispatchOutgoing)).toContain('777');
  });
});

describe('booking.payment_captured: подавление fallback-сообщения', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('не шлёт пациенту fallback-текст, когда второй event оплаты помечен suppression', async () => {
    const dispatchOutgoing = vi.fn(async () => ({}));
    const parsed = parseBookingLifecycleEvent({
      eventType: 'booking.payment_captured',
      idempotencyKey: 'booking.payment_captured:payment-1:appointment-2',
      payload: {
        ...basePayload(),
        bookingId: '11111111-1111-4111-8111-111111111111',
        suppressPatientNotification: true,
        doctorNotify: false,
      },
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;

    await handleBookingLifecycleEvent(
      parsed.data,
      { dispatchOutgoing } as unknown as DispatchPort,
      {
        idempotencyPort: createInMemoryIdempotencyPort(),
        webappEventsPort: fakeWebappEventsPort(),
      },
    );

    expect(recipientsOf(dispatchOutgoing)).toEqual([]);
  });
});

describe('booking.rescheduled: suppression относится только к внешним каналам', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('не отправляет пациенту messenger-сообщение, но сохраняет persistent lifecycle step', async () => {
    const dispatchOutgoing = vi.fn(async () => ({}));
    const webappEventsPort = fakeWebappEventsPort();

    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.rescheduled',
        idempotencyKey: 'booking.lifecycle:rescheduled:transition-1',
        payload: { ...basePayload(), suppressPatientNotification: true },
      },
      { dispatchOutgoing } as unknown as DispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort(), webappEventsPort },
    );

    expect(recipientsOf(dispatchOutgoing)).not.toContain('123');
    expect(webappEventsPort.notifyPatientWebPush).toHaveBeenCalledOnce();
  });
});

// S11/PAT-NOTIF-01..03: each new fact must survive a consumer outage, then converge on replay.
// The signed webapp port is the external delivery boundary; no notification text is pinned.
describe('S11 remaining lifecycle families', () => {
  it.each(['booking.reminder_due', 'booking.cash_payment', 'booking.refund_succeeded',
    'booking.prepayment_retained', 'booking.visit_completed'] as const)(
    '%s retries the failed persistent consumer and acknowledges only one successful delivery', async (eventType) => {
      const notify = vi.fn(async () => ({ ok: true, status: 200 }))
        .mockResolvedValueOnce({ ok: false, status: 503 });
      const dispatchOutgoing = vi.fn(async () => ({}));
      const event = {
        eventType, idempotencyKey: `s11:${eventType}:occurrence-1`,
        payload: { ...basePayload(), occurrenceId: 'occurrence-1', suppressPatientNotification: true },
      };
      const options = {
        idempotencyPort: createInMemoryIdempotencyPort(),
        webappEventsPort: { ...fakeWebappEventsPort(), notifyPatientWebPush: notify },
      };
      await expect(handleBookingLifecycleEvent(event, { dispatchOutgoing }, options)).rejects.toThrow();
      await handleBookingLifecycleEvent(event, { dispatchOutgoing }, options);
      await handleBookingLifecycleEvent(event, { dispatchOutgoing }, options);
      expect(notify).toHaveBeenCalledTimes(2);
      expect(dispatchOutgoing).not.toHaveBeenCalled();
    },
  );
});
