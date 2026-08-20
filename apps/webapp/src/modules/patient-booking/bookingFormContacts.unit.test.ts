import { describe, expect, it, vi } from 'vitest';
import { createBookingOnCanonicalEngine, type CanonicalBookingDeps } from './canonicalCreate';
import { createPlatformUserContactsService } from '@/modules/platform-user-contacts/service';
import { createInMemoryPlatformUserContactsPort } from '@/infra/repos/inMemoryPlatformUserContacts';
import type { CreatePatientBookingInput, PatientBookingRecord } from './types';

/**
 * Ловимая поломка: человек набрал телефон и почту в форме записи, запись создалась, а контакты
 * НЕ сохранились — и никто об этом не узнал.
 *
 * Так и было до 19.08: чтение контактов уходило в доакторский порт, отказ 42501 глотал голый
 * `catch {}`, и `platform_user_contacts` оставалась пустой при каждой пациентской записи.
 * Отказ дорогой (связаться с человеком нечем) и молчаливый (ответ маршрута — 200 OK) — ступень 2
 * канона тестов.
 */

const logged: Array<{ message: string }> = [];
vi.mock('@/app-layer/logging/logger', () => ({
  logger: {
    error: (_ctx: unknown, message: string) => {
      logged.push({ message });
    },
    warn: () => undefined,
    info: () => undefined,
    debug: () => undefined,
  },
}));

function fakeRecord(): PatientBookingRecord {
  return {
    id: 'booking-1', organizationId: 'org-1', userId: 'user-1', bookingType: 'online', city: null,
    category: 'general', slotStart: '2027-03-10T09:00:00.000Z', slotEnd: '2027-03-10T09:30:00.000Z',
    status: 'confirmed', cancelledAt: null, cancelReason: null, gcalEventId: null,
    contactPhone: '+79995550111', contactEmail: 'typed@example.test', contactName: 'Пациент',
    reminder24hSent: false, reminder2hSent: false, createdAt: '2027-03-01T00:00:00.000Z',
    updatedAt: '2027-03-01T00:00:00.000Z', branchServiceId: null, branchId: null, serviceId: null,
    cityCodeSnapshot: null, branchTitleSnapshot: null, serviceTitleSnapshot: null,
    durationMinutesSnapshot: 60, priceMinorSnapshot: null, canonicalAppointmentId: 'appt-1',
    provenanceCreatedBy: null, provenanceUpdatedBy: null,
  };
}

function buildDeps(overrides: Partial<CanonicalBookingDeps> = {}): CanonicalBookingDeps {
  const record = fakeRecord();
  return {
    outboundMessageQueue: { enqueue: async () => true },
    bookingsPort: {
      createPending: vi.fn(async () => record),
      markConfirmed: vi.fn(async () => record),
      markFailedSync: vi.fn(async () => undefined),
    } as unknown as CanonicalBookingDeps['bookingsPort'],
    syncPort: { emitBookingEvent: async () => undefined } as unknown as CanonicalBookingDeps['syncPort'],
    bookingEngine: {
      createOnlineAppointmentsIfAvailable: vi.fn(async () => [
        { id: 'appt-1', organizationId: 'org-1', startAt: record.slotStart, endAt: record.slotEnd },
      ]),
    } as unknown as CanonicalBookingDeps['bookingEngine'],
    bookingScheduling: {
      assertSlotAvailable: vi.fn(async () => undefined),
      getMaxConsecutiveSlotHours: vi.fn(async () => 8),
    } as unknown as CanonicalBookingDeps['bookingScheduling'],
    bookingForm: null,
    payments: null,
    canAcceptBookingPrepayment: async () => false,
    memberships: null,
    clientHistory: null,
    ...overrides,
  };
}

const createInput: CreatePatientBookingInput = {
  type: 'online',
  userId: 'user-1',
  organizationId: 'org-1',
  category: 'general',
  slotStart: '2027-03-10T09:00:00.000Z',
  slotEnd: '2027-03-10T09:30:00.000Z',
  contactName: 'Пациент',
  contactPhone: '+79995550111',
  contactEmail: 'typed@example.test',
};

describe('контакты из формы записи', () => {
  it('телефон и почта, набранные человеком, лежат в его контактах после записи', async () => {
    const contacts = createPlatformUserContactsService(createInMemoryPlatformUserContactsPort());

    await createBookingOnCanonicalEngine(
      buildDeps({
        platformUserContacts: contacts,
        getPlatformUserIdentityContacts: async () => ({ phone: null, email: null }),
      }),
      createInput,
    );

    const stored = await contacts.listForPlatformUser('user-1');
    expect(
      stored.map((row) => ({ type: row.contactType, value: row.value, source: row.source })),
    ).toEqual(
      expect.arrayContaining([
        { type: 'phone', value: '+79995550111', source: 'booking' },
        { type: 'email', value: 'typed@example.test', source: 'booking' },
      ]),
    );
  });

  it('потерянный контакт сообщается, а подтверждённая запись остаётся', async () => {
    logged.length = 0;
    const refusing = createPlatformUserContactsService({
      listByPlatformUserId: async () => [],
      getById: async () => null,
      upsertContact: async () => {
        throw Object.assign(new Error('permission denied for table platform_user_contacts'), {
          code: '42501',
        });
      },
      deleteById: async () => false,
    });

    const booking = await createBookingOnCanonicalEngine(
      buildDeps({
        platformUserContacts: refusing,
        getPlatformUserIdentityContacts: async () => ({ phone: null, email: null }),
      }),
      createInput,
    );

    expect(booking.status).toBe('confirmed');
    expect(logged.map((row) => row.message)).toEqual([
      '[booking] booking form contacts were not stored',
    ]);
  });
});
