import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getTargetsByPhoneMock } = vi.hoisted(() => ({
  getTargetsByPhoneMock: vi.fn(async () => ({ channelBindings: { telegramId: '123' } })),
}));

vi.mock('../../infra/db/client.js', () => ({ createDbPort: vi.fn(() => ({})) }));
vi.mock('../../infra/operatorIncident/operatorHealthAlertConfigIntegrator.js', () => ({
  loadAdminMessengerIdLists: vi.fn(async () => ({ telegram: ['777'], max: [] })),
}));
vi.mock('../../infra/adapters/deliveryTargetsPort.js', () => ({
  createDeliveryTargetsPort: vi.fn(() => ({
    getTargetsByPhone: getTargetsByPhoneMock,
  })),
}));
vi.mock('../max/maxRecipient.js', () => ({ maxUserRecipient: vi.fn((id: string) => ({ id })) }));
vi.mock('../../config/appTimezone.js', () => ({
  getAppDisplayTimezone: vi.fn(async () => 'UTC'),
}));
vi.mock('../google-calendar/sync.js', () => ({
  syncCanonicalAppointmentToCalendar: vi.fn(async () => undefined),
}));

import { handleBookingLifecycleEvent } from './bookingLifecycleRoute.js';
import type { BookingLifecycleRouteDeps } from './bookingLifecycleRoute.js';
import { formatBookingRuDateTime } from './bookingNotificationFormat.js';
import { createInMemoryIdempotencyPort } from '../../infra/db/repos/idempotencyKeys.js';
import type { DbWritePort, DispatchPort, WebappEventsPort } from '../../kernel/contracts/index.js';

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

function fakeDispatchPort(): DispatchPort {
  return { dispatchOutgoing: vi.fn(async () => ({})) } as unknown as DispatchPort;
}

function fakeWebappEventsPort(): WebappEventsPort & {
  notifyPatientWebPush: ReturnType<typeof vi.fn>;
  materializeAppointmentReminders: ReturnType<typeof vi.fn>;
} {
  return {
    emit: vi.fn(async () => ({ ok: true, status: 200 })),
    notifyPatientWebPush: vi.fn(async () => undefined),
    materializeAppointmentReminders: vi.fn(async () => ({ ok: true, status: 200 })),
  } as unknown as WebappEventsPort & {
    notifyPatientWebPush: ReturnType<typeof vi.fn>;
    materializeAppointmentReminders: ReturnType<typeof vi.fn>;
  };
}

describe('booking lifecycle tenant identity propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the payload organizationId to the linked-channel M2M lookup', async () => {
    const payload = basePayload();

    await handleBookingLifecycleEvent(
      { eventType: 'booking.created', payload, idempotencyKey: 'org-propagation' },
      fakeDispatchPort(),
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );

    expect(getTargetsByPhoneMock).toHaveBeenCalledWith(payload.contactPhone, {
      organizationId: payload.organizationId,
    });
  });
});

describe('D14(1): webapp decides whether to cancel pending reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels when the webapp says cancel (or says nothing)', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappEventsPort = fakeWebappEventsPort();
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.cancelled',
        payload: { ...basePayload(), cancelPendingReminders: true },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort(), webappEventsPort },
    );
    expect(JSON.parse(webappEventsPort.materializeAppointmentReminders.mock.calls[0]![0].body)).toMatchObject({
      cancelPending: true,
      reminderPlan: { enabled: false, offsetsMinutes: [] },
    });
  });

  it('does not cancel when the webapp says do not cancel', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappEventsPort = fakeWebappEventsPort();
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.cancelled',
        payload: { ...basePayload(), cancelPendingReminders: false },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort(), webappEventsPort },
    );
    expect(JSON.parse(webappEventsPort.materializeAppointmentReminders.mock.calls[0]![0].body)).toMatchObject({
      cancelPending: false,
    });
  });

  it('keeps the previous always-cancel behavior when the field is absent', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappEventsPort = fakeWebappEventsPort();
    await handleBookingLifecycleEvent(
      { eventType: 'booking.cancelled', payload: basePayload() },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort(), webappEventsPort },
    );
    expect(JSON.parse(webappEventsPort.materializeAppointmentReminders.mock.calls[0]![0].body)).toMatchObject({
      cancelPending: true,
    });
  });
});

describe('D14(2): webapp decides whether/which patient push to send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends exactly the variant the webapp set, on a rescheduled event', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappEventsPort = fakeWebappEventsPort();
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.rescheduled',
        payload: {
          ...basePayload(),
          organizationId: '22222222-2222-2222-2222-222222222222',
          patientPushVariant: 'created',
        },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort(), webappEventsPort },
    );
    expect(webappEventsPort.notifyPatientWebPush).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (webappEventsPort.notifyPatientWebPush.mock.calls[0] as [{ body: string }])[0].body,
    );
    expect(body.variant).toBe('created');
  });

  it('sends no push when the webapp explicitly says not to', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappEventsPort = fakeWebappEventsPort();
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.rescheduled',
        payload: {
          ...basePayload(),
          organizationId: '22222222-2222-2222-2222-222222222222',
          patientPushVariant: null,
        },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort(), webappEventsPort },
    );
    expect(webappEventsPort.notifyPatientWebPush).not.toHaveBeenCalled();
  });

  it('keeps the previous per-event default variant when the field is absent', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappEventsPort = fakeWebappEventsPort();
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.rescheduled',
        payload: {
          ...basePayload(),
          organizationId: '22222222-2222-2222-2222-222222222222',
        },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort(), webappEventsPort },
    );
    expect(webappEventsPort.notifyPatientWebPush).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (webappEventsPort.notifyPatientWebPush.mock.calls[0] as [{ body: string }])[0].body,
    );
    expect(body.variant).toBe('rescheduled');
  });
});

describe('D14(3): webapp decides the patient message text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function patientTextSentTo(
    dispatchPort: DispatchPort,
    eventIdPrefix: string,
  ): string | undefined {
    const calls = (dispatchPort.dispatchOutgoing as ReturnType<typeof vi.fn>).mock.calls as [
      { meta: { eventId: string }; payload: { message: { text: string } } },
    ][];
    const call = calls.find(
      ([intent]) =>
        intent.meta.eventId.startsWith(`${eventIdPrefix}:`) &&
        !intent.meta.eventId.includes(':doctor:'),
    );
    return call?.[0].payload.message.text;
  }

  it('sends exactly the text the webapp sent, verbatim, on booking.created', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappText = 'Вебапп прислал: приём назначен на завтра.';
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.created',
        payload: { ...basePayload(), patientMessageText: webappText },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    expect(patientTextSentTo(dispatchPort, 'booking-created')).toBe(webappText);
  });

  it('sends exactly the text the webapp sent, verbatim, on booking.cancelled', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappText = 'Вебапп прислал: запись отменена по вашей просьбе.';
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.cancelled',
        payload: { ...basePayload(), patientMessageText: webappText },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    expect(patientTextSentTo(dispatchPort, 'booking-cancelled')).toBe(webappText);
  });

  it('sends exactly the text the webapp sent, verbatim, on booking.rescheduled', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappText = 'Вебапп прислал: приём перенесён на новую дату.';
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.rescheduled',
        payload: { ...basePayload(), patientMessageText: webappText },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    expect(patientTextSentTo(dispatchPort, 'booking-rescheduled')).toBe(webappText);
  });

  it('sends exactly the text the webapp sent, verbatim, on booking.payment_captured', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappText = 'Вебапп прислал: оплата прошла успешно.';
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.payment_captured',
        payload: { ...basePayload(), patientMessageText: webappText },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    expect(patientTextSentTo(dispatchPort, 'booking-payment')).toBe(webappText);
  });

  it('keeps the previous integrator-authored text verbatim when the field is absent', async () => {
    const dispatchPort = fakeDispatchPort();
    const payload = basePayload();
    await handleBookingLifecycleEvent(
      { eventType: 'booking.created', payload },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    const dateLabel = formatBookingRuDateTime(payload.slotStart, 'UTC');
    expect(patientTextSentTo(dispatchPort, 'booking-created')).toBe(
      `Запись подтверждена: ${dateLabel}\nОчный приём`,
    );
  });

  it('does not append to or otherwise modify the webapp-sent text', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappText = 'Ровно этот текст и ничего больше.';
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.created',
        payload: { ...basePayload(), patientMessageText: webappText },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    const sent = patientTextSentTo(dispatchPort, 'booking-created');
    expect(sent).toBe(webappText);
    expect(sent).not.toContain('Запись подтверждена');
  });
});

describe('D14(4): webapp decides whether/what to notify the doctor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function doctorTextSentTo(
    dispatchPort: DispatchPort,
    eventIdPrefix: string,
  ): string | undefined {
    const calls = (dispatchPort.dispatchOutgoing as ReturnType<typeof vi.fn>).mock.calls as [
      { meta: { eventId: string }; payload: { message: { text: string } } },
    ][];
    const call = calls.find(
      ([intent]) =>
        intent.meta.eventId.startsWith(`${eventIdPrefix}:`) &&
        intent.meta.eventId.includes(':doctor:'),
    );
    return call?.[0].payload.message.text;
  }

  it('sends no doctor message when the webapp says do not notify', async () => {
    const dispatchPort = fakeDispatchPort();
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.created',
        payload: { ...basePayload(), doctorNotify: false },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    expect(doctorTextSentTo(dispatchPort, 'booking-created')).toBeUndefined();
  });

  it('sends exactly the doctor text the webapp sent, verbatim, on booking.created', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappText = 'Вебапп прислал: врачу новая запись.';
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.created',
        payload: { ...basePayload(), doctorMessageText: webappText },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    expect(doctorTextSentTo(dispatchPort, 'booking-created')).toBe(webappText);
  });

  it('sends exactly the doctor text the webapp sent, verbatim, on booking.cancelled', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappText = 'Вебапп прислал: врачу отмена записи.';
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.cancelled',
        payload: { ...basePayload(), doctorMessageText: webappText },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    expect(doctorTextSentTo(dispatchPort, 'booking-cancelled')).toBe(webappText);
  });

  it('sends exactly the doctor text the webapp sent, verbatim, on booking.rescheduled', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappText = 'Вебапп прислал: врачу перенос записи.';
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.rescheduled',
        payload: { ...basePayload(), doctorMessageText: webappText },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    expect(doctorTextSentTo(dispatchPort, 'booking-rescheduled')).toBe(webappText);
  });

  it('sends exactly the doctor text the webapp sent, verbatim, on booking.payment_captured', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappText = 'Вебапп прислал: врачу оплата подтверждена.';
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.payment_captured',
        payload: { ...basePayload(), doctorMessageText: webappText },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    expect(doctorTextSentTo(dispatchPort, 'booking-payment')).toBe(webappText);
  });

  it('keeps the previous always-notify behavior with the previous integrator text when both fields are absent', async () => {
    const dispatchPort = fakeDispatchPort();
    const payload = basePayload();
    await handleBookingLifecycleEvent(
      { eventType: 'booking.created', payload },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    const dateLabel = formatBookingRuDateTime(payload.slotStart, 'UTC');
    expect(doctorTextSentTo(dispatchPort, 'booking-created')).toBe(
      `Новая запись: ${payload.contactName}, ${payload.contactPhone}\nДата: ${dateLabel}`,
    );
  });

  it('does not append to or otherwise modify the webapp-sent doctor text', async () => {
    const dispatchPort = fakeDispatchPort();
    const webappText = 'Ровно этот текст врачу и ничего больше.';
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.created',
        payload: { ...basePayload(), doctorMessageText: webappText },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    const sent = doctorTextSentTo(dispatchPort, 'booking-created');
    expect(sent).toBe(webappText);
    expect(sent).not.toContain('Новая запись');
  });
});

describe('D14(5): webapp decides the calendar action and title marker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function lastCalendarSyncCall() {
    const { syncCanonicalAppointmentToCalendar } = await import('../google-calendar/sync.js');
    const calls = (syncCanonicalAppointmentToCalendar as ReturnType<typeof vi.fn>).mock.calls as [
      { action: string; titleMarker?: string },
    ][];
    return calls.at(-1)?.[0];
  }

  it('performs exactly the calendar action the webapp set', async () => {
    const dispatchPort = fakeDispatchPort();
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.created',
        payload: {
          ...basePayload(),
          canonicalAppointmentId: '33333333-3333-3333-3333-333333333333',
          calendarAction: 'canceled',
        },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    expect((await lastCalendarSyncCall())?.action).toBe('canceled');
  });

  it('applies exactly the title marker the webapp set', async () => {
    const dispatchPort = fakeDispatchPort();
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.created',
        payload: {
          ...basePayload(),
          canonicalAppointmentId: '33333333-3333-3333-3333-333333333334',
          calendarTitleMarker: 'reschedule_pending',
        },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    expect((await lastCalendarSyncCall())?.titleMarker).toBe('reschedule_pending');
  });

  it('keeps the previous per-event-type computation when the fields are absent', async () => {
    const dispatchPort = fakeDispatchPort();
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.cancelled',
        payload: {
          ...basePayload(),
          canonicalAppointmentId: '33333333-3333-3333-3333-333333333335',
        },
      },
      dispatchPort,
      { idempotencyPort: createInMemoryIdempotencyPort() },
    );
    const call = await lastCalendarSyncCall();
    expect(call?.action).toBe('updated');
    expect(call?.titleMarker).toBe('cancelled');
  });
});

describe('D34: idempotencyPort is a mandatory dependency, not an in-memory fallback', () => {
  it('the route deps type rejects an object missing idempotencyPort', () => {
    // Поломка-арбитр: верни `idempotencyPort?: IdempotencyPort` в BookingLifecycleRouteDeps — строка ниже
    // перестанет быть ошибкой типов, `@ts-expect-error` станет неиспользуемой директивой, и `tsc --noEmit`
    // покраснеет на этом файле.
    // @ts-expect-error idempotencyPort is required; omitting it must fail to compile, not fall back silently.
    const deps: BookingLifecycleRouteDeps = {
      sharedSecret: 'secret',
      dispatchPort: fakeDispatchPort(),
      dbWritePort: {} as DbWritePort,
    };
    expect(deps).toBeDefined();
  });

  it('the same event id, delivered twice through the real port, reaches the patient exactly once', async () => {
    const dispatchPort = fakeDispatchPort();
    const idempotencyPort = createInMemoryIdempotencyPort();
    const event = {
      eventType: 'booking.created' as const,
      payload: basePayload(),
    };

    await handleBookingLifecycleEvent(event, dispatchPort, { idempotencyPort });
    await handleBookingLifecycleEvent(event, dispatchPort, { idempotencyPort });

    const calls = (dispatchPort.dispatchOutgoing as ReturnType<typeof vi.fn>).mock.calls as [
      { meta: { eventId: string } },
    ][];
    const patientSends = calls.filter(
      ([intent]) =>
        intent.meta.eventId.startsWith(`booking-created:${event.payload.bookingId}:`) &&
        !intent.meta.eventId.includes(':doctor:'),
    );
    expect(patientSends).toHaveLength(1);
  });
});
