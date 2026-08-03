import type { UserRole } from '@/shared/types/session';

/**
 * Owner, 2026-08-04 (docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md §9): patients never have a
 * password — login stays code/OAuth/messenger/passkey only. Staff (doctor/admin) keep email+password.
 */
export const PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR = 'password_not_available_for_role';

export function isPasswordEligibleRole(role: UserRole): boolean {
  return role !== 'client';
}
