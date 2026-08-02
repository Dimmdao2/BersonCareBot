/**
 * Единая политика редиректов и безопасного next.
 * Используется в auth service, guards, app entry page и AuthBootstrap.
 */
import type { UserRole } from '@/shared/types/session';
import { routePaths } from '@/app-layer/routes/paths';
import {
  isSafeRolePortalNext,
  roleCanUsePortal,
  type RoleLoginPortal,
} from '@/modules/auth/roleLogin';

const SAFE_NEXT_PREFIX = '/app/patient';
const SAFE_NEXT_EXCLUDE = '/app/patient/bind-phone';
const SAFE_STAFF_FIRST_RUN_FALLBACK = '/app/account?tab=security';

/** Путь для редиректа по роли в собственный кабинет. */
export function getRedirectPathForRole(role: UserRole): string {
  if (role === 'admin') return routePaths.admin;
  if (role === 'doctor') return routePaths.doctor;
  return routePaths.patient;
}

/** Проверка, что next= безопасен для редиректа (только patient subtree, без bind-phone). */
export function isSafeNext(next: string | null): next is string {
  if (!next || typeof next !== 'string') return false;
  const path = next.startsWith('/') ? next : new URL(next, 'http://localhost').pathname;
  return path.startsWith(SAFE_NEXT_PREFIX) && !path.startsWith(SAFE_NEXT_EXCLUDE);
}

/**
 * Целевой путь после входа:
 * - doctor/admin: workspace по роли, кроме точного server-issued first-run security fallback,
 * - client: безопасный next, затем безопасный fallback из API, затем путь по роли.
 */
export function getPostAuthRedirectTarget(
  role: UserRole,
  nextParam: string | null,
  fallbackRedirectTo?: string | null,
  portal?: RoleLoginPortal | null,
): string {
  if (portal) {
    if (!roleCanUsePortal(role, portal)) {
      return `${getRedirectPathForRole(role)}?app_access_denied=1`;
    }
    if (isSafeRolePortalNext(nextParam, portal)) return nextParam;
  }
  if (role !== 'client') {
    return fallbackRedirectTo === SAFE_STAFF_FIRST_RUN_FALLBACK
      ? SAFE_STAFF_FIRST_RUN_FALLBACK
      : getRedirectPathForRole(role);
  }
  if (isSafeNext(nextParam)) return nextParam;
  const fallback = fallbackRedirectTo ?? null;
  if (isSafeNext(fallback)) return fallback;
  return getRedirectPathForRole(role);
}
