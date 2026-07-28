import { env } from '@/config/env';
import type { UserRole } from '@/shared/types/session';
import { normalizeEmail } from './emailAuth';

/**
 * C-4 (2026-07-26, docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): admin/doctor role is never granted by
 * a DB-resident or env-resident allowlist anymore — not `admin_emails`, not
 * `admin_phones`/`admin_telegram_ids`/`admin_max_ids`, not `doctor_phones`/`doctor_telegram_ids`/
 * `doctor_max_ids`, and not their `ADMIN_*`/`DOCTOR_*` env fallbacks. `platform_users.role` — set
 * only by migration/provisioning or (later) an explicit invitation, never by a login-time list
 * lookup — is the single source of a staff role, plus the independent env-pinned owner identity in
 * {@link isVerifiedEmailGlobalAdminAsync}.
 *
 * This resolver always returns "client" now. It is kept only so every existing caller (service.ts's
 * messenger/phone/OAuth exchange paths) keeps its call shape; each of those callers composes the
 * result with {@link reconcileDbRoleWithEnvRole} before ever comparing it against — or persisting it
 * over — an existing DB role, so an env source that can only ever say "client" is structurally
 * unable to demote an existing admin/doctor row.
 */
export function resolveRoleFromEnv(_ids: {
  phone?: string;
  telegramId?: string;
  maxId?: string;
}): UserRole {
  return 'client';
}

/**
 * Compatibility policy for legacy env-based staff allowlists.
 *
 * Env may still promote an existing client session to doctor/admin, but it must not demote
 * a DB-stored staff role. Self-registered specialists get `platform_users.role='doctor'`
 * from provisioning and must keep that role on later password logins even when they are not
 * listed in legacy env allowlists.
 *
 * Since C-4, `envRole` passed in here is always `"client"` ({@link resolveRoleFromEnv} /
 * {@link resolveRoleAsync} never resolve anything else) — the admin/doctor promotion branches below
 * are therefore dead in current practice. The function is kept, and every caller keeps composing
 * through it, precisely so that stays true structurally rather than by caller discipline: a future
 * env/DB source that resolves "admin"/"doctor" again still could not demote an existing DB role.
 */
export function reconcileDbRoleWithEnvRole(currentRole: UserRole, envRole: UserRole): UserRole {
  if (envRole === 'admin') return 'admin';
  if (currentRole === 'admin') return 'admin';
  if (envRole === 'doctor') return 'doctor';
  if (currentRole === 'doctor') return 'doctor';
  return 'client';
}

/**
 * C-4: the legacy env/DB messenger+phone allowlists (`admin_telegram_ids`/`admin_max_ids`/
 * `admin_phones`/`doctor_telegram_ids`/`doctor_max_ids`/`doctor_phones`) no longer confer role, and
 * are no longer read here at all. Retained only for its call shape — see
 * {@link resolveRoleFromEnv}'s doc comment, which applies verbatim.
 */
export async function resolveRoleAsync(_ids: {
  phone?: string;
  telegramId?: string;
  maxId?: string;
}): Promise<UserRole> {
  return 'client';
}

/**
 * The single source of the admin role, alongside a persisted `platform_users.role='admin'` row
 * (migration `0233_global_admin_hard_role.sql` plus the idempotent env-pinned assertion in
 * `instrumentation.ts`). Compares only against the env-pinned owner identity
 * (`env.PLATFORM_OWNER_IDENTITY`) — the `admin_emails` DB-resident allowlist is never read for
 * authorization anymore (docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md). Deliberately fail-closed: an
 * empty/unset pin, or an email that does not match it, is never admin. The identifier is kept
 * abstracted on purpose (env value, not "email" in the name) — a later switch to a phone number or
 * ЕСИА id (taskdb #1034/#1035) is a value change here, not a rebuild.
 */
export async function isVerifiedEmailGlobalAdminAsync(email: string | undefined): Promise<boolean> {
  const normalized = normalizeEmail(email ?? '');
  if (!normalized) return false;
  const pinned = normalizeEmail(env.PLATFORM_OWNER_IDENTITY ?? '');
  return Boolean(pinned) && pinned === normalized;
}

/**
 * Async whitelist checker: are these IDs whitelisted for webapp entry?
 * Whitelist disabled — webapp is open to all authenticated users.
 */
export async function isWhitelistedAsync(_ids: {
  phone?: string;
  telegramId?: string;
  maxId?: string;
}): Promise<boolean> {
  return true;
}
