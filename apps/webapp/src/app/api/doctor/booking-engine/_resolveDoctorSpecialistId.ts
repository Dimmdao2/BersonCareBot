import type { DoctorBookingEngineContext } from "./_requireDoctorBookingEngine";

/**
 * Resolves the specialist whose schedule the logged-in doctor owns.
 *
 * Solo-model (current product): `be_specialists` has no `user_id` link — the doctor's
 * own specialist is the org's single active specialist (the owner). This mirrors the
 * resolution already used by the doctor calendar feed and the doctor manual-booking
 * route (`resolveDefaultSpecialistId`), keeping the schedule editor and the calendar
 * reading/writing the SAME specialist-scoped rows.
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
  const own = specialists.find((s) => s.isActive) ?? specialists[0] ?? null;
  return own?.id ?? null;
}
