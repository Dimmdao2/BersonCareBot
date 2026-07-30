import type { DoctorBookingEngineContext } from './_requireDoctorBookingEngine';

/**
 * Resolves the specialist whose schedule the logged-in doctor owns.
 *
 * The active organization membership carries the doctor's specialist id. Resolve that
 * exact row instead of picking the first specialist in a multi-specialist clinic.
 *
 * SECURITY: every doctor schedule route MUST force this id onto reads and writes and
 * MUST NEVER trust a client-supplied `specialistId`. A doctor may only touch rows of
 * THIS specialist — never another specialist's rows and never clinic-wide (NULL) rows.
 *
 * Returns null when the org has no specialist yet (a doctor cannot create one — that is
 * an admin/catalog setup step); the caller surfaces a clear error instead of writing.
 */
export async function resolveDoctorOwnSpecialistId(
  ctx: DoctorBookingEngineContext,
): Promise<string | null> {
  const specialists = await ctx.service.catalog.listSpecialists(ctx.organizationId);
  const own = ctx.specialistId
    ? specialists.find((specialist) => specialist.id === ctx.specialistId && specialist.isActive)
    : null;
  return own?.id ?? null;
}
