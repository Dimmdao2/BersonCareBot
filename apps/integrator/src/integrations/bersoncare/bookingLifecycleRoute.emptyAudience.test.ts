import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Регресс 18.08: запись владельца не ушла ни в Telegram, ни в MAX, ни врачу. Резолвер аудитории
 * отвечал ошибкой, интегратор писал одну строку `notification_audience_empty` в журнал — и всё.
 * Ни инцидента, ни алерта; сбой прожил часы и был найден руками.
 *
 * Эти тесты держат ровно это: пользовательское уведомление, оставшееся без адресата, ОБЯЗАНО
 * поднять инцидент через существующий механизм (`reportOperatorFailure` → `operator_incidents`),
 * с причиной, отличающей отказ резолвера от честно пустого списка каналов, и с dedup-ключом,
 * который не зависит от конкретной записи.
 */

const { getTargetsByPhoneMock, loadAdminMessengerIdListsMock, reportOperatorFailureMock } =
  vi.hoisted(() => ({
    getTargetsByPhoneMock: vi.fn(async () => ({ channelBindings: { telegramId: '123' } })),
    loadAdminMessengerIdListsMock: vi.fn(async () => ({ telegram: ['777'], max: [] })),
    reportOperatorFailureMock: vi.fn(async () => undefined),
  }));

vi.mock('../../infra/db/client.js', () => ({ createDbPort: vi.fn(() => ({})) }));
vi.mock('../../infra/operatorIncident/operatorHealthAlertConfigIntegrator.js', () => ({
  loadAdminMessengerIdLists: loadAdminMessengerIdListsMock,
}));
vi.mock('../../infra/operatorIncident/reportOperatorFailure.js', () => ({
  reportOperatorFailure: reportOperatorFailureMock,
}));
vi.mock('../../infra/adapters/deliveryTargetsPort.js', () => ({
  createDeliveryTargetsPort: vi.fn(() => ({ getTargetsByPhone: getTargetsByPhoneMock })),
}));
vi.mock('../max/maxRecipient.js', () => ({ maxUserRecipient: vi.fn((id: string) => ({ id })) }));
vi.mock('../../config/appTimezone.js', () => ({ getAppDisplayTimezone: vi.fn(async () => 'UTC') }));
vi.mock('../google-calendar/sync.js', () => ({
  syncCanonicalAppointmentToCalendar: vi.fn(async () => undefined),
}));

import {
  BOOKING_LINKED_CHANNEL_TOPIC,
  BOOKING_STAFF_MESSAGE_TOPIC,
  handleBookingLifecycleEvent,
} from './bookingLifecycleRoute.js';
import { EMPTY_AUDIENCE_INCIDENT_DIRECTION } from '../../infra/operatorIncident/reportEmptyNotificationAudience.js';
import { createInMemoryIdempotencyPort } from '../../infra/db/repos/idempotencyKeys.js';
import type { DispatchPort } from '../../kernel/contracts/index.js';

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

async function runBookingCreated(idempotencyKey: string) {
  const payload = basePayload();
  await handleBookingLifecycleEvent(
    { eventType: 'booking.created', payload, idempotencyKey },
    fakeDispatchPort(),
    { idempotencyPort: createInMemoryIdempotencyPort() },
  );
  return payload;
}

function incidentsFor(topic: string): Record<string, unknown>[] {
  return (reportOperatorFailureMock.mock.calls as unknown as Record<string, unknown>[][])
    .map((call) => call[0]!)
    .filter((input) => input.integration === topic);
}

describe('empty audience for a user-facing booking notification raises an operator incident', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTargetsByPhoneMock.mockResolvedValue({ channelBindings: { telegramId: '123' } });
    loadAdminMessengerIdListsMock.mockResolvedValue({ telegram: ['777'], max: [] });
  });

  it('raises an incident when the audience resolver fails, naming the resolver as the reason', async () => {
    getTargetsByPhoneMock.mockResolvedValue(null as never);

    await runBookingCreated('empty-audience-resolver-failed');

    const raised = incidentsFor(BOOKING_LINKED_CHANNEL_TOPIC);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({
      direction: EMPTY_AUDIENCE_INCIDENT_DIRECTION,
      integration: BOOKING_LINKED_CHANNEL_TOPIC,
      errorClass: 'empty_audience_resolution_failed',
      errorDetail: 'user_facing',
    });
  });

  it('raises an incident when the resolver answers with no channel at all', async () => {
    getTargetsByPhoneMock.mockResolvedValue({ channelBindings: {} } as never);

    await runBookingCreated('empty-audience-no-bindings');

    expect(incidentsFor(BOOKING_LINKED_CHANNEL_TOPIC)).toEqual([
      expect.objectContaining({ errorClass: 'empty_audience_no_channel_bindings' }),
    ]);
  });

  // Ретрай события при отказе резолвера — прежний контракт (см. bookingLifecycleRoute.dedup.test),
  // он сохраняется. Новое здесь только одно: отказ перестал быть тихим.
  it('raises an incident when the staff audience cannot be resolved, without swallowing the retry', async () => {
    loadAdminMessengerIdListsMock.mockRejectedValue(
      new Error('admin_notification_targets_unavailable'),
    );

    await expect(runBookingCreated('empty-audience-staff-resolver')).rejects.toThrow(
      'admin_notification_targets_unavailable',
    );

    expect(incidentsFor(BOOKING_STAFF_MESSAGE_TOPIC)).toEqual([
      expect.objectContaining({ errorClass: 'empty_audience_resolution_failed' }),
    ]);
  });

  it('raises an incident when no staff member holds a messenger binding', async () => {
    loadAdminMessengerIdListsMock.mockResolvedValue({ telegram: [], max: [] });

    await runBookingCreated('empty-audience-staff-none');

    expect(incidentsFor(BOOKING_STAFF_MESSAGE_TOPIC)).toEqual([
      expect.objectContaining({ errorClass: 'empty_audience_no_channel_bindings' }),
    ]);
  });

  it('keeps the dedup key free of per-booking identity so one broken topic does not page repeatedly', async () => {
    getTargetsByPhoneMock.mockResolvedValue(null as never);

    const first = await runBookingCreated('empty-audience-dedup-1');
    const second = await runBookingCreated('empty-audience-dedup-2');
    expect(first.bookingId).not.toEqual(second.bookingId);

    const raised = incidentsFor(BOOKING_LINKED_CHANNEL_TOPIC);
    expect(raised).toHaveLength(2);
    // Dedup-ключ инцидента = direction:integration:errorClass. Все три поля обязаны совпасть,
    // иначе каждая запись открывала бы НОВЫЙ инцидент и алерт уходил бы на каждую.
    expect(raised[0]).toMatchObject({
      direction: raised[1]!.direction,
      integration: raised[1]!.integration,
      errorClass: raised[1]!.errorClass,
    });
    for (const input of raised) {
      expect(JSON.stringify(input)).not.toContain(first.bookingId);
      expect(JSON.stringify(input)).not.toContain(second.bookingId);
    }
  });

  it('does not raise an incident when the notification actually reaches a channel', async () => {
    await runBookingCreated('empty-audience-happy-path');

    expect(incidentsFor(BOOKING_LINKED_CHANNEL_TOPIC)).toHaveLength(0);
    expect(incidentsFor(BOOKING_STAFF_MESSAGE_TOPIC)).toHaveLength(0);
  });
});
