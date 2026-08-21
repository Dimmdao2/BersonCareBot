import { isDbPrincipalPlatformUserId } from '@bersoncare/db-principal';

/**
 * `platform_users.id` in webapp is UUID; legacy session ids (e.g. `tg:…`) are not.
 *
 * C-1 / D7 (2026-07-26): this must be the SAME predicate the DB-principal layer applies, and is
 * therefore a thin delegation rather than its own regex. The two used to differ — this one took any
 * 8-4-4-4-12 hex, `normalizeDbPrincipalPlatformUserId` demanded RFC-4122 version 1-5 — so an id
 * that this file called "DB-backed" could not be installed as a principal: the identity read threw,
 * the fail-closed session chokepoint rejected, and that user was permanently 401 (which is what
 * broke staff login in DEV, and is what a UUIDv7 id would have done in production). Do not
 * re-introduce a local regex here.
 */
export function isPlatformUserUuid(userId: string): boolean {
  return isDbPrincipalPlatformUserId(userId);
}
