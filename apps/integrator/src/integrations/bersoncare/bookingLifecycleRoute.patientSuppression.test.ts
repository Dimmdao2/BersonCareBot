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
    notifyPatientWebPush: vi.fn(async () => undefined),
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
      { idempotencyPort: createInMemoryIdempotencyPort(), webappEventsPort: fakeWebappEventsPort() },
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
      { idempotencyPort: createInMemoryIdempotencyPort(), webappEventsPort: fakeWebappEventsPort() },
    );

    expect(recipientsOf(dispatchOutgoing)).toContain('123');
    expect(recipientsOf(dispatchOutgoing)).toContain('777');
  });
});
