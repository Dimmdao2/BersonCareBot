/**
 * Cutover switch: when disabled, v1 requests that rely on `rubitime_booking_profiles`
 * (`resolveScheduleParams` / `resolveBookingProfile`) fail fast with `legacy_resolve_disabled`.
 *
 * v2 M2M bodies (explicit Rubitime IDs) ignore this flag.
 *
 * Env-only operational toggle (process bootstrap / cutover), not integration secrets.
 */
export function isLegacyBookingProfileResolveEnabled(): boolean {
  const v = process.env.RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}
