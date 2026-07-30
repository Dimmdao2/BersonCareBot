import { describe, expect, it, vi } from 'vitest';
import type { BeAppointment } from '@/modules/booking-engine/types';
import type { DoctorBookingEngineContext } from './_requireDoctorBookingEngine';
import { resolveDoctorAppointmentAccess } from './_resolveDoctorAppointmentAccess';

const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000001';
const FOREIGN_ORGANIZATION_ID = '20000000-0000-4000-8000-000000000002';
const OWN_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';

function appointment(specialistId: string | null, organizationId = ORGANIZATION_ID): BeAppointment {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    organizationId,
    branchId: null,
    roomId: null,
    specialistId,
    serviceId: null,
    platformUserId: null,
    startAt: '2026-07-30T10:00:00.000Z',
    endAt: '2026-07-30T10:30:00.000Z',
    durationMinutes: 30,
    source: 'admin_manual',
    status: 'confirmed',
    originalStartAt: null,
    rescheduleCount: 0,
    paymentRef: null,
    packageUsageRef: null,
    phoneNormalized: null,
    attributionJson: {},
  };
}

function context(
  candidate: BeAppointment | null,
  canManageAllSpecialists: boolean,
): DoctorBookingEngineContext {
  return {
    session: { user: { userId: 'user-1' } } as DoctorBookingEngineContext['session'],
    service: {
      getAppointment: vi.fn().mockResolvedValue(candidate),
    } as unknown as DoctorBookingEngineContext['service'],
    organizationId: ORGANIZATION_ID,
    membershipId: 'membership-1',
    membershipRole: 'doctor',
    specialistId: OWN_ID,
    canManageOrganization: canManageAllSpecialists,
    canManageAllSpecialists,
  };
}

describe('resolveDoctorAppointmentAccess', () => {
  it('allows a doctor to read their own appointment', async () => {
    const own = appointment(OWN_ID);
    await expect(
      resolveDoctorAppointmentAccess(context(own, false), own.id, 'clinic'),
    ).resolves.toBe(own);
  });

  it('denies another specialist appointment to a normal doctor', async () => {
    const other = appointment(OTHER_ID);
    await expect(
      resolveDoctorAppointmentAccess(context(other, false), other.id, 'clinic'),
    ).resolves.toBeNull();
  });

  it('allows a clinic manager to read another current-clinic appointment', async () => {
    const other = appointment(OTHER_ID);
    await expect(
      resolveDoctorAppointmentAccess(context(other, true), other.id, 'clinic'),
    ).resolves.toBe(other);
  });

  it('never exposes another organization or broadens own-only actions', async () => {
    const foreign = appointment(OTHER_ID, FOREIGN_ORGANIZATION_ID);
    await expect(
      resolveDoctorAppointmentAccess(context(foreign, true), foreign.id, 'clinic'),
    ).resolves.toBeNull();

    const sameClinicOther = appointment(OTHER_ID);
    await expect(
      resolveDoctorAppointmentAccess(context(sameClinicOther, true), sameClinicOther.id, 'own'),
    ).resolves.toBeNull();
  });
});
