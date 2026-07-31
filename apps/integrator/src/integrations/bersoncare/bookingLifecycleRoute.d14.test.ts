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

import { handleBookingLifecycleEvent } from './bookingLifecycleRoute.js';
import { formatBookingRuDateTime } from './bookingNotificationFormat.js';
import type { DispatchPort, WebappEventsPort } from '../../kernel/contracts/index.js';

let bookingCounter = 0;

function basePayload() {
  bookingCounter += 1;
  return {
    bookingId: `11111111-1111-1111-1111-11111111${String(bookingCounter).padStart(4, '0')}`,
    userId: 'user-1',
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

function fakeWebappEventsPort(): WebappEventsPort & { notifyPatientWebPush: ReturnType<typeof vi.fn> } {
  return {
    emit: vi.fn(async () => ({ ok: true, status: 200 })),
    notifyPatientWebPush: vi.fn(async () => undefined),
  } as unknown as WebappEventsPort & { notifyPatientWebPush: ReturnType<typeof vi.fn> };
}

describe('D14(1): webapp decides whether to cancel pending reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels when the webapp says cancel (or says nothing)', async () => {
    const dispatchPort = fakeDispatchPort();
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.cancelled',
        payload: { ...basePayload(), cancelPendingReminders: true },
      },
      dispatchPort,
      {},
    );
    expect(cancelPendingBookingReminderJobsByBookingId).toHaveBeenCalledTimes(1);
  });

  it('does not cancel when the webapp says do not cancel', async () => {
    const dispatchPort = fakeDispatchPort();
    await handleBookingLifecycleEvent(
      {
        eventType: 'booking.cancelled',
        payload: { ...basePayload(), cancelPendingReminders: false },
      },
      dispatchPort,
      {},
    );
    expect(cancelPendingBookingReminderJobsByBookingId).not.toHaveBeenCalled();
  });

  it('keeps the previous always-cancel behavior when the field is absent', async () => {
    const dispatchPort = fakeDispatchPort();
    await handleBookingLifecycleEvent(
      { eventType: 'booking.cancelled', payload: basePayload() },
      dispatchPort,
      {},
    );
    expect(cancelPendingBookingReminderJobsByBookingId).toHaveBeenCalledTimes(1);
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
      { webappEventsPort },
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
      { webappEventsPort },
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
      { webappEventsPort },
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
      {},
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
      {},
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
      {},
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
      {},
    );
    expect(patientTextSentTo(dispatchPort, 'booking-payment')).toBe(webappText);
  });

  it('keeps the previous integrator-authored text verbatim when the field is absent', async () => {
    const dispatchPort = fakeDispatchPort();
    const payload = basePayload();
    await handleBookingLifecycleEvent(
      { eventType: 'booking.created', payload },
      dispatchPort,
      {},
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
      {},
    );
    const sent = patientTextSentTo(dispatchPort, 'booking-created');
    expect(sent).toBe(webappText);
    expect(sent).not.toContain('Запись подтверждена');
  });
});
