import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Найдено 19.08: обработчик события записи выполнял шаги одной цепочкой `await`-ов, и на
 * `booking.created` календарь стоял ПОСЛЕ напоминаний. Напоминания падали — календарь не выполнялся
 * никогда. При этом отказ освобождал единый ключ дедупликации, и повтор события (до трёх попыток)
 * слал пациенту и врачу ВТОРОЕ и ТРЕТЬЕ такое же сообщение.
 *
 * Здесь проверяется то, что видит человек: попадает ли запись в календарь врача, когда напоминания
 * сломаны, и приходит ли пациенту/врачу второе сообщение при повторе события.
 */

const {
  getTargetsByPhoneMock,
  loadAdminMessengerIdListsMock,
  recordOperatorFailureIncidentMock,
  reportOperatorFailureMock,
  syncCanonicalAppointmentToCalendarMock,
} = vi.hoisted(() => ({
  getTargetsByPhoneMock: vi.fn(async () => ({ channelBindings: { telegramId: '123' } })),
  loadAdminMessengerIdListsMock: vi.fn(async () => ({ telegram: ['777'], max: [] })),
  recordOperatorFailureIncidentMock: vi.fn(async (_input: Record<string, unknown>) => ({
    id: 'incident',
    occurrenceCount: 1,
  })),
  reportOperatorFailureMock: vi.fn(async (_input: Record<string, unknown>) => undefined),
  syncCanonicalAppointmentToCalendarMock: vi.fn(async (_input: Record<string, unknown>) => undefined),
}));

vi.mock('../../infra/db/client.js', () => ({ createDbPort: vi.fn(() => ({})) }));
vi.mock('../../infra/operatorIncident/operatorHealthAlertConfigIntegrator.js', () => ({
  loadAdminMessengerIdLists: loadAdminMessengerIdListsMock,
}));
vi.mock('../../infra/operatorIncident/reportOperatorFailure.js', () => ({
  recordOperatorFailureIncident: recordOperatorFailureIncidentMock,
  reportOperatorFailure: reportOperatorFailureMock,
}));
vi.mock('../../infra/adapters/deliveryTargetsPort.js', () => ({
  createDeliveryTargetsPort: vi.fn(() => ({ getTargetsByPhone: getTargetsByPhoneMock })),
}));
vi.mock('../max/maxRecipient.js', () => ({ maxUserRecipient: vi.fn((id: string) => ({ id })) }));
vi.mock('../../config/appTimezone.js', () => ({ getAppDisplayTimezone: vi.fn(async () => 'UTC') }));
vi.mock('../google-calendar/sync.js', () => ({
  syncCanonicalAppointmentToCalendar: syncCanonicalAppointmentToCalendarMock,
}));

import {
  BOOKING_LIFECYCLE_STEP_INCIDENT_DIRECTION,
  BOOKING_REMINDER_MATERIALIZATION_TOPIC,
  handleBookingLifecycleEvent,
} from './bookingLifecycleRoute.js';
import { EMPTY_AUDIENCE_INCIDENT_DIRECTION } from '../../infra/operatorIncident/reportEmptyNotificationAudience.js';
import type {
  BookingLifecycleEventValidated,
  BookingLifecyclePayloadValidated,
} from './bookingLifecycleSchema.js';
import type { DispatchPort, IdempotencyPort, WebappEventsPort } from '../../kernel/contracts/index.js';

const APPOINTMENT_ID = '20000000-0000-4000-8000-000000000002';

function payload(): BookingLifecyclePayloadValidated {
  return {
    organizationId: '10000000-0000-4000-8000-000000000001',
    bookingId: '11111111-1111-4111-8111-111111111111',
    canonicalAppointmentId: APPOINTMENT_ID,
    userId: '30000000-0000-4000-8000-000000000003',
    bookingType: 'in_person',
    category: 'general',
    slotStart: '2027-01-02T12:00:00.000Z',
    slotEnd: '2027-01-02T12:30:00.000Z',
    contactName: 'Пациент',
    contactPhone: '+79990000000',
    reminderPlan: { enabled: true, offsetsMinutes: [60] },
  } as BookingLifecyclePayloadValidated;
}

function createdEvent(): BookingLifecycleEventValidated {
  return {
    eventType: 'booking.created',
    idempotencyKey: 'step-isolation',
    payload: payload(),
  } as BookingLifecycleEventValidated;
}

/** Ведёт себя как таблица ключей, а не как память процесса: переживает «повтор запроса». */
function persistentIdempotencyPort(): IdempotencyPort {
  const store = new Set<string>();
  return {
    tryAcquire: async (key: string) => (store.has(key) ? false : (store.add(key), true)),
    release: async (key: string) => {
      store.delete(key);
    },
  };
}

function dispatchPort(): DispatchPort & { dispatchOutgoing: ReturnType<typeof vi.fn> } {
  return { dispatchOutgoing: vi.fn(async () => ({})) } as unknown as DispatchPort & {
    dispatchOutgoing: ReturnType<typeof vi.fn>;
  };
}

function recipientsOf(dispatch: ReturnType<typeof vi.fn>): string[] {
  return dispatch.mock.calls.map((call) => {
    const intent = call[0] as { payload: { recipient: Record<string, unknown> } };
    return String(intent.payload.recipient.chatId ?? intent.payload.recipient.id ?? '');
  });
}

function webappEventsPort(materialize: WebappEventsPort['materializeAppointmentReminders']) {
  return {
    emit: vi.fn(async () => ({ ok: true, status: 200 })),
    notifyPatientWebPush: vi.fn(async () => undefined),
    materializeAppointmentReminders: materialize,
  } as unknown as WebappEventsPort;
}

describe('booking.created: упавший шаг не отменяет остальные и повтор не рождает второе сообщение', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTargetsByPhoneMock.mockResolvedValue({ channelBindings: { telegramId: '123' } });
    loadAdminMessengerIdListsMock.mockResolvedValue({ telegram: ['777'], max: [] });
  });

  it('напоминания не создались — запись всё равно попадает в календарь врача', async () => {
    const port = persistentIdempotencyPort();
    const send = dispatchPort();

    await expect(
      handleBookingLifecycleEvent(createdEvent(), send, {
        idempotencyPort: port,
        webappEventsPort: webappEventsPort(async () => ({ ok: false, status: 503 })),
      }),
    ).rejects.toThrow('appointment_reminders');

    expect(syncCanonicalAppointmentToCalendarMock).toHaveBeenCalledTimes(1);
    expect(syncCanonicalAppointmentToCalendarMock.mock.calls[0]![0]).toMatchObject({
      appointmentId: APPOINTMENT_ID,
      action: 'created',
    });
    // Пациент и врач своё получили — их шаги от падения напоминаний не зависят.
    expect(recipientsOf(send.dispatchOutgoing)).toEqual(expect.arrayContaining(['123', '777']));
  });

  it('повтор события после отказа не шлёт пациенту и врачу второго сообщения, но доигрывает упавший шаг', async () => {
    const port = persistentIdempotencyPort();
    const materialize = vi
      .fn<NonNullable<WebappEventsPort['materializeAppointmentReminders']>>()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const first = dispatchPort();
    await expect(
      handleBookingLifecycleEvent(createdEvent(), first, {
        idempotencyPort: port,
        webappEventsPort: webappEventsPort(materialize),
      }),
    ).rejects.toThrow('appointment_reminders');
    expect(recipientsOf(first.dispatchOutgoing)).toEqual(expect.arrayContaining(['123', '777']));

    const retry = dispatchPort();
    await handleBookingLifecycleEvent(createdEvent(), retry, {
      idempotencyPort: port,
      webappEventsPort: webappEventsPort(materialize),
    });

    // Ни пациент (telegram 123), ни врач (telegram 777) второго сообщения не получают.
    expect(recipientsOf(retry.dispatchOutgoing)).toEqual([]);
    // А напоминания при повторе всё-таки создаются.
    expect(materialize).toHaveBeenCalledTimes(2);
  });

  it('отказ материализации напоминаний открывает операторский инцидент, а не тонет в 502', async () => {
    await expect(
      handleBookingLifecycleEvent(createdEvent(), dispatchPort(), {
        idempotencyPort: persistentIdempotencyPort(),
        webappEventsPort: webappEventsPort(async () => ({ ok: false, status: 503 })),
      }),
    ).rejects.toThrow('APPOINTMENT_REMINDER_MATERIALIZATION_FAILED:503');

    expect(
      reportOperatorFailureMock.mock.calls
        .map((call) => call[0])
        .filter((input) => input.integration === BOOKING_REMINDER_MATERIALIZATION_TOPIC),
    ).toEqual([
      expect.objectContaining({
        direction: EMPTY_AUDIENCE_INCIDENT_DIRECTION,
        integration: BOOKING_REMINDER_MATERIALIZATION_TOPIC,
        errorClass: 'reminder_materialization_failed',
      }),
    ]);
  });

  it('врач не получил сообщения о записи — оператор узнаёт об этом, а не только журнал', async () => {
    loadAdminMessengerIdListsMock.mockRejectedValue(new Error('admin_targets_unavailable'));

    await expect(
      handleBookingLifecycleEvent(createdEvent(), dispatchPort(), {
        idempotencyPort: persistentIdempotencyPort(),
        webappEventsPort: webappEventsPort(async () => ({ ok: true, status: 200 })),
      }),
    ).rejects.toThrow('doctor_message');

    expect(
      recordOperatorFailureIncidentMock.mock.calls
        .map((call) => call[0])
        .filter((input) => input.integration === 'doctor_message'),
    ).toEqual([
      expect.objectContaining({
        direction: BOOKING_LIFECYCLE_STEP_INCIDENT_DIRECTION,
        integration: 'doctor_message',
        errorClass: 'booking.created_step_failed',
      }),
    ]);
  });
});
