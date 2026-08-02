import type { UserRole } from '@/shared/types/session';

export type RoleLoginPortal = 'doctor' | 'patient' | 'admin';

const portalPaths: Record<RoleLoginPortal, string> = {
  doctor: '/app/doctor',
  patient: '/app/patient',
  admin: '/app/admin',
};

export function getRoleLoginPath(portal: RoleLoginPortal): string {
  return `${portalPaths[portal]}/login`;
}

export function getRolePortalPath(portal: RoleLoginPortal): string {
  return portalPaths[portal];
}

export function roleCanUsePortal(role: UserRole, portal: RoleLoginPortal): boolean {
  if (portal === 'patient') return role === 'client';
  if (portal === 'doctor') return role === 'doctor';
  return role === 'admin';
}

export function portalForAppPath(pathname: string): RoleLoginPortal | null {
  for (const portal of Object.keys(portalPaths) as RoleLoginPortal[]) {
    const path = portalPaths[portal];
    if (pathname === path || pathname.startsWith(`${path}/`)) return portal;
  }
  return null;
}

export function isRoleLoginPath(pathname: string): boolean {
  const portal = portalForAppPath(pathname);
  return portal !== null && pathname === getRoleLoginPath(portal);
}

/** A deep link is accepted only by the portal that issued it, never by the generic entry. */
export function isSafeRolePortalNext(next: string | null, portal: RoleLoginPortal): next is string {
  if (!next || typeof next !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(next, 'http://localhost');
  } catch {
    return false;
  }
  if (parsed.origin !== 'http://localhost') return false;
  const portalPath = getRolePortalPath(portal);
  if (parsed.pathname !== portalPath && !parsed.pathname.startsWith(`${portalPath}/`)) {
    return false;
  }
  if (parsed.pathname === getRoleLoginPath(portal)) return false;
  // A phone-binding flow is a recovery/onboarding boundary, not a post-login continuation.
  return !(portal === 'patient' && parsed.pathname.startsWith('/app/patient/bind-phone'));
}
