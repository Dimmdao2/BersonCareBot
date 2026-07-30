import { z } from 'zod';
import type {
  DoctorScheduleScopeInput,
  DoctorScheduleScopeMode,
  DoctorScheduleSpecialistOption,
  ResolvedDoctorScheduleScope,
} from '@/modules/doctor-schedule/scope';
import type { DoctorBookingEngineContext } from './_requireDoctorBookingEngine';

export type {
  DoctorScheduleScopeInput,
  DoctorScheduleScopeMode,
  DoctorScheduleSpecialistOption,
  ResolvedDoctorScheduleScope,
} from '@/modules/doctor-schedule/scope';

const DoctorScheduleScopeQuerySchema = z.object({
  scope: z.enum(['mine', 'clinic', 'specialist']).optional().nullable(),
  specialistId: z.string().uuid().optional().nullable(),
});

export function parseDoctorScheduleScopeQuery(
  searchParams: URLSearchParams,
): { ok: true; value: DoctorScheduleScopeInput } | { ok: false; error: 'invalid_schedule_scope' } {
  const parsed = DoctorScheduleScopeQuerySchema.safeParse({
    scope: searchParams.get('scope') ?? undefined,
    specialistId: searchParams.get('specialistId') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'invalid_schedule_scope' };
  if (parsed.data.scope === 'specialist' && !parsed.data.specialistId) {
    return { ok: false, error: 'invalid_schedule_scope' };
  }
  return { ok: true, value: parsed.data };
}

export type DoctorScheduleScopeResolution =
  | { ok: true; value: ResolvedDoctorScheduleScope }
  | {
      ok: false;
      error: 'schedule_specialist_not_configured' | 'schedule_specialist_not_available';
    };

/**
 * Resolves the schedule audience exclusively from the authenticated workspace and
 * the current organization's active specialist catalog.
 *
 * A normal doctor is always forced to their own active specialist, regardless of
 * client input. A clinic administrator may request the clinic or one validated
 * active specialist. No branch may select a specialist from another organization.
 */
export async function resolveDoctorScheduleScope(
  ctx: DoctorBookingEngineContext,
  input: DoctorScheduleScopeInput,
): Promise<DoctorScheduleScopeResolution> {
  const activeSpecialists = (await ctx.service.catalog.listSpecialists(ctx.organizationId)).filter(
    (specialist) => specialist.isActive,
  );
  const ownSpecialist = ctx.specialistId
    ? (activeSpecialists.find((specialist) => specialist.id === ctx.specialistId) ?? null)
    : null;

  if (!ctx.canManageAllSpecialists) {
    if (!ownSpecialist) {
      return { ok: false, error: 'schedule_specialist_not_configured' };
    }
    return {
      ok: true,
      value: {
        scope: 'mine',
        specialistId: ownSpecialist.id,
        ownSpecialistId: ownSpecialist.id,
        canManageAllSpecialists: false,
        specialists: [{ id: ownSpecialist.id, displayLabel: ownSpecialist.fullName }],
      },
    };
  }

  const specialists = activeSpecialists.map((specialist) => ({
    id: specialist.id,
    displayLabel: specialist.fullName,
  }));
  const requestedScope =
    input.scope ?? (input.specialistId ? 'specialist' : ownSpecialist ? 'mine' : 'clinic');

  if (requestedScope === 'clinic') {
    return {
      ok: true,
      value: {
        scope: 'clinic',
        specialistId: null,
        ownSpecialistId: ownSpecialist?.id ?? null,
        canManageAllSpecialists: true,
        specialists,
      },
    };
  }

  if (requestedScope === 'mine') {
    if (!ownSpecialist) {
      return { ok: false, error: 'schedule_specialist_not_configured' };
    }
    return {
      ok: true,
      value: {
        scope: 'mine',
        specialistId: ownSpecialist.id,
        ownSpecialistId: ownSpecialist.id,
        canManageAllSpecialists: true,
        specialists,
      },
    };
  }

  const selected = input.specialistId
    ? (activeSpecialists.find((specialist) => specialist.id === input.specialistId) ?? null)
    : null;
  if (!selected) {
    return { ok: false, error: 'schedule_specialist_not_available' };
  }
  return {
    ok: true,
    value: {
      scope: 'specialist',
      specialistId: selected.id,
      ownSpecialistId: ownSpecialist?.id ?? null,
      canManageAllSpecialists: true,
      specialists,
    },
  };
}
