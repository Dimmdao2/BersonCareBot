/**
 * Что здесь доказывается: публичная запись доходит до базы под ПАЦИЕНТСКИМ принципалом и только
 * после того, как посетитель стал клиентом этой клиники.
 *
 * Почему это поведение, а не форма кода. До 19.08 запись шла под организационным принципалом, и
 * половина ЗАПИСИ была мертва целиком: два пациентских корня (`is_current_patient_self_booking_allowed`,
 * `read_current_patient_booking_packages`) вызывались без пациента в контексте, а сам приём база
 * отказывалась создавать, потому что у человека не было строки `org_enrollments` в этой клинике.
 * Порядок здесь — не стилистика: приём, созданный ДО зачисления, отвергает
 * `app.create_current_patient_booking_appointments`, а зачисление, сделанное под принципалом с
 * заявкой на эту же клинику, отвергает гейт арендатора. Оба шага обязаны идти именно так.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  withPatientIdentityPrincipal: vi.fn(),
  withPatientOrganizationPrincipal: vi.fn(),
  enrollCurrentPatientInPublicBookingClinic: vi.fn(),
  revokePublicBookingEnrollment: vi.fn(),
  resolveCurrentPatientInPersonBookingContext: vi.fn(),
  createBooking: vi.fn(),
  getPool: vi.fn(),
  recordPublicBookingMergeCandidates: vi.fn(),
  order: [] as string[],
}));

vi.mock('@/app-layer/db/client', () => ({ getPool: fakes.getPool }));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientIdentityPrincipal: fakes.withPatientIdentityPrincipal,
  withPatientOrganizationPrincipal: fakes.withPatientOrganizationPrincipal,
}));
vi.mock('@/infra/repos/pgPublicBookingUserResolve', () => ({
  enrollCurrentPatientInPublicBookingClinic: fakes.enrollCurrentPatientInPublicBookingClinic,
  revokePublicBookingEnrollment: fakes.revokePublicBookingEnrollment,
}));
vi.mock('@/app-layer/platform-user/recordPublicBookingMergeCandidates', () => ({
  recordPublicBookingMergeCandidates: fakes.recordPublicBookingMergeCandidates,
}));
vi.mock('@/modules/patient-booking/inPersonBookingResolve', () => ({
  InPersonBookingResolveError: class InPersonBookingResolveError extends Error {},
  resolveCurrentPatientInPersonBookingContext: fakes.resolveCurrentPatientInPersonBookingContext,
}));

import { createVerifiedPublicBooking } from './createVerifiedPublicBooking';

const PLATFORM_USER_ID = 'person-1';
const CHANNEL = 'public_booking_phone_otp' as const;
const ORGANIZATION_ID = 'org-1';

const intent = {
  v: 1 as const,
  organizationId: ORGANIZATION_ID,
  branchId: 'branch-1',
  serviceId: 'service-1',
  slotStart: '2027-01-01T10:00:00.000Z',
  slotEnd: '2027-01-01T11:00:00.000Z',
  slotCount: 1,
  contactName: 'Посетитель',
  contactPhone: '+79990000000',
  contactEmail: undefined,
  formAnswers: undefined,
  attribution: undefined,
};

function deps() {
  return {
    bookingEngine: { catalog: {}, services: {} },
    bookingScheduling: {},
    patientBooking: { createBooking: fakes.createBooking },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.order = [];
  fakes.withPatientIdentityPrincipal.mockImplementation(
    (_ctx: unknown, callback: () => Promise<unknown>) => callback(),
  );
  fakes.withPatientOrganizationPrincipal.mockImplementation(
    (_ctx: unknown, callback: () => Promise<unknown>) => callback(),
  );
  fakes.enrollCurrentPatientInPublicBookingClinic.mockImplementation(async () => {
    fakes.order.push('enroll');
    return { status: 'active', effect: 'created' };
  });
  fakes.revokePublicBookingEnrollment.mockImplementation(async () => {
    fakes.order.push('revoke');
    return 'deleted';
  });
  fakes.resolveCurrentPatientInPersonBookingContext.mockResolvedValue({
    branchId: 'branch-1',
    serviceId: 'service-1',
    organizationId: ORGANIZATION_ID,
    cityCode: 'Moscow',
  });
  fakes.createBooking.mockImplementation(async () => {
    fakes.order.push('createBooking');
    return { id: 'booking-1', status: 'confirmed', canonicalAppointmentId: null };
  });
  fakes.recordPublicBookingMergeCandidates.mockResolvedValue(undefined);
});

describe('createVerifiedPublicBooking', () => {
  it('makes the visitor a client of the clinic before the booking is written', async () => {
    await createVerifiedPublicBooking(deps(), intent, PLATFORM_USER_ID, CHANNEL);

    expect(fakes.order).toEqual(['enroll', 'createBooking']);
    expect(fakes.enrollCurrentPatientInPublicBookingClinic).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      CHANNEL,
    );
  });

  it('enrols under an identity-only patient principal and writes under the tenant-scoped one', async () => {
    await createVerifiedPublicBooking(deps(), intent, PLATFORM_USER_ID, CHANNEL);

    // Зачисление — до заявки на арендатора: заявку на клинику, где строки ещё нет, гейт отвергает.
    expect(fakes.withPatientIdentityPrincipal).toHaveBeenCalledWith(
      expect.objectContaining({ platformUserId: PLATFORM_USER_ID }),
      expect.any(Function),
    );
    expect(fakes.withPatientIdentityPrincipal.mock.calls[0]?.[0]).not.toHaveProperty(
      'organizationId',
    );
    // Сама запись — под пациентским принципалом ЭТОГО человека в ЭТОЙ клинике, а не под
    // организационным: пациентские корни записи без пациента в контексте не работают вовсе.
    expect(fakes.withPatientOrganizationPrincipal).toHaveBeenCalledWith(
      expect.objectContaining({
        platformUserId: PLATFORM_USER_ID,
        organizationId: ORGANIZATION_ID,
      }),
      expect.any(Function),
    );
  });

  it('refuses to write when the resolved context names another organization', async () => {
    fakes.resolveCurrentPatientInPersonBookingContext.mockResolvedValue({
      branchId: 'branch-1',
      serviceId: 'service-1',
      organizationId: 'org-2',
      cityCode: 'Moscow',
    });

    await expect(
      createVerifiedPublicBooking(deps(), intent, PLATFORM_USER_ID, CHANNEL),
    ).rejects.toThrow();
    expect(fakes.createBooking).not.toHaveBeenCalled();
    // Провалившаяся запись не оставляет человека клиентом клиники: зачисление коммитится своей
    // порт-транзакцией раньше приёма и вместе с ним откатиться не может, поэтому его снимает
    // компенсация. Без неё проигравший гонку за слот остаётся в списке клиентов с нулём приёмов.
    expect(fakes.order).toEqual(['enroll', 'revoke']);
    expect(fakes.revokePublicBookingEnrollment).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('keeps a committed booking when the back-office duplicate hint cannot be recorded', async () => {
    fakes.createBooking.mockResolvedValue({
      id: 'booking-1',
      status: 'confirmed',
      canonicalAppointmentId: 'appointment-1',
    });
    fakes.recordPublicBookingMergeCandidates.mockRejectedValue(new Error('capability denied'));

    const booking = await createVerifiedPublicBooking(deps(), intent, PLATFORM_USER_ID, CHANNEL);

    expect(booking).toMatchObject({ id: 'booking-1' });
  });
});
