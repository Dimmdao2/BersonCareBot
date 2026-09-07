import { describe, expect, it, vi } from 'vitest';
import type { DoctorBookingEngineContext } from './_requireDoctorBookingEngine';
import { resolveDoctorScheduleScope } from './_resolveDoctorScheduleScope';

const OWN_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';
const INACTIVE_ID = '10000000-0000-4000-8000-000000000003';

function makeContext(input: {
  ownSpecialistId: string | null;
  canManageAllSpecialists: boolean;
}): DoctorBookingEngineContext {
  const listSpecialists = vi.fn().mockResolvedValue([
    { id: OWN_ID, fullName: 'Свой специалист', isActive: true },
    { id: OTHER_ID, fullName: 'Другой специалист', isActive: true },
    { id: INACTIVE_ID, fullName: 'Неактивный специалист', isActive: false },
  ]);
  return {
    session: { user: { userId: 'user-1' } } as DoctorBookingEngineContext['session'],
    service: {
      catalog: { listSpecialists },
    } as unknown as DoctorBookingEngineContext['service'],
    organizationId: '20000000-0000-4000-8000-000000000001',
    membershipId: '30000000-0000-4000-8000-000000000001',
    membershipRole: 'doctor',
    specialistId: input.ownSpecialistId,
    canManageOrganization: input.canManageAllSpecialists,
    canManageAllSpecialists: input.canManageAllSpecialists,
    appointmentsManageOwn: true,
    availabilityManageOwn: true,
  };
}

describe('resolveDoctorScheduleScope', () => {
  it('forces a normal doctor to their own active specialist despite hostile client scope', async () => {
    const result = await resolveDoctorScheduleScope(
      makeContext({ ownSpecialistId: OWN_ID, canManageAllSpecialists: false }),
      { scope: 'clinic', specialistId: OTHER_ID },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        scope: 'mine',
        specialistId: OWN_ID,
        ownSpecialistId: OWN_ID,
        canManageAllSpecialists: false,
        specialists: [{ id: OWN_ID, displayLabel: 'Свой специалист' }],
      },
    });
  });

  it('fails closed instead of assigning the first clinic specialist to a doctor without one', async () => {
    const result = await resolveDoctorScheduleScope(
      makeContext({ ownSpecialistId: null, canManageAllSpecialists: false }),
      {},
    );

    expect(result).toEqual({ ok: false, error: 'schedule_specialist_not_configured' });
  });

  it('forces a clinic admin with a specialist binding to own scope on the doctor surface', async () => {
    const ctx = makeContext({ ownSpecialistId: OWN_ID, canManageAllSpecialists: true });

    await expect(resolveDoctorScheduleScope(ctx, { scope: 'clinic' })).resolves.toMatchObject({
      ok: true,
      value: { scope: 'mine', specialistId: OWN_ID, canManageAllSpecialists: false },
    });
    await expect(
      resolveDoctorScheduleScope(ctx, { scope: 'specialist', specialistId: OTHER_ID }),
    ).resolves.toMatchObject({
      ok: true,
      value: { scope: 'mine', specialistId: OWN_ID, canManageAllSpecialists: false },
    });
  });

  it('keeps clinic and selected-specialist scope available only on the management surface', async () => {
    const ctx = makeContext({ ownSpecialistId: OWN_ID, canManageAllSpecialists: true });

    await expect(
      resolveDoctorScheduleScope(ctx, { scope: 'clinic' }, 'management'),
    ).resolves.toMatchObject({ ok: true, value: { scope: 'clinic', specialistId: null } });
    await expect(
      resolveDoctorScheduleScope(
        ctx,
        { scope: 'specialist', specialistId: OTHER_ID },
        'management',
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: { scope: 'specialist', specialistId: OTHER_ID },
    });
  });

  it('rejects an inactive, absent, or missing selected specialist for a clinic admin', async () => {
    const ctx = makeContext({ ownSpecialistId: OWN_ID, canManageAllSpecialists: true });

    await expect(
      resolveDoctorScheduleScope(
        ctx,
        { scope: 'specialist', specialistId: INACTIVE_ID },
        'management',
      ),
    ).resolves.toEqual({ ok: false, error: 'schedule_specialist_not_available' });
    await expect(
      resolveDoctorScheduleScope(ctx, { scope: 'specialist', specialistId: null }, 'management'),
    ).resolves.toEqual({ ok: false, error: 'schedule_specialist_not_available' });
  });

  it('keeps a management-only admin out of doctor scope while defaulting management to clinic', async () => {
    const ctx = makeContext({ ownSpecialistId: null, canManageAllSpecialists: true });

    await expect(resolveDoctorScheduleScope(ctx, {})).resolves.toEqual({
      ok: false,
      error: 'schedule_specialist_not_configured',
    });
    await expect(resolveDoctorScheduleScope(ctx, {}, 'management')).resolves.toMatchObject({
      ok: true,
      value: {
        scope: 'clinic',
        specialistId: null,
        ownSpecialistId: null,
        canManageAllSpecialists: true,
      },
    });
  });
});
