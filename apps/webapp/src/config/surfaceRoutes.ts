import type { RequestSurface, ResolvedSurface } from '@/shared/lib/surface/requestSurface';
import { publicBookPaths, publicClinicCardPath } from '@/shared/publicBook/paths';

/**
 * Route audience only. Host -> surface lives exclusively in `requestSurface.ts` (TPB-16).
 *
 * Stage A used this table to infer identity from pathname. After Host separation that would be a
 * second surface resolver, so query-based identity and the patient fallback are gone. The table
 * now answers only whether a resolved Host may enter a route tree; shared routes deliberately do
 * not choose between staff and patient.
 */
export type SurfaceRouteAudience = 'shared' | 'staff' | 'patient';

type SurfaceRouteMatch =
  | { readonly kind: 'exact' | 'prefix'; readonly path: string }
  | { readonly kind: 'pattern'; readonly pattern: RegExp };

type SurfaceRouteRule = Readonly<{
  match: SurfaceRouteMatch;
  audience: SurfaceRouteAudience;
  why: string;
}>;

export const SURFACE_ROUTE_RULES: readonly SurfaceRouteRule[] = [
  {
    match: { kind: 'exact', path: '/' },
    audience: 'shared',
    why: 'The Host chooses staff landing, patient entry or branded clinic root.',
  },
  {
    match: { kind: 'exact', path: '/app' },
    audience: 'shared',
    why: 'The common login/registration shell is branded by Host, never by intent/query.',
  },
  {
    match: { kind: 'prefix', path: '/app/contact-support' },
    audience: 'shared',
    why: 'Recovery/support is reachable from both login surfaces.',
  },
  {
    match: { kind: 'prefix', path: '/legal' },
    audience: 'shared',
    why: 'One legal kit owned by the platform company is reachable from both surfaces.',
  },
  {
    match: { kind: 'prefix', path: '/app/patient' },
    audience: 'patient',
    why: 'Patient cabinet and patient login.',
  },
  {
    match: { kind: 'prefix', path: '/app/tg' },
    audience: 'patient',
    why: 'Telegram patient entry.',
  },
  {
    match: { kind: 'prefix', path: '/app/max' },
    audience: 'patient',
    why: 'MAX patient entry.',
  },
  {
    match: { kind: 'prefix', path: '/book' },
    audience: 'patient',
    why: 'Public patient booking.',
  },
  {
    match: { kind: 'prefix', path: '/join' },
    audience: 'patient',
    why: 'Patient program invitation.',
  },
  {
    match: { kind: 'prefix', path: '/app/doctor' },
    audience: 'staff',
    why: 'Specialist cabinet and staff login.',
  },
  {
    match: { kind: 'prefix', path: '/app/admin' },
    audience: 'staff',
    why: 'Platform operations routes; Host/role guards further split platform admin.',
  },
  {
    match: { kind: 'prefix', path: '/app/account' },
    audience: 'staff',
    why: 'Staff personal account.',
  },
  {
    match: { kind: 'prefix', path: '/app/clinic' },
    audience: 'staff',
    why: 'Clinic staff invitation.',
  },
  {
    match: { kind: 'prefix', path: '/app/manage' },
    audience: 'staff',
    why: 'Clinic management.',
  },
  {
    match: { kind: 'prefix', path: '/app/settings' },
    audience: 'staff',
    why: 'Clinic/specialist settings.',
  },
  {
    match: { kind: 'exact', path: '/specialist' },
    audience: 'staff',
    why: 'Therapysto specialist directory must never fall through to a patient clinic card.',
  },
  {
    match: { kind: 'exact', path: '/specialists' },
    audience: 'staff',
    why: 'Therapysto specialist directory must never fall through to a patient clinic card.',
  },
  {
    match: { kind: 'pattern', pattern: /^\/[^/]+\/media\/[^/]+$/ },
    audience: 'patient',
    why: 'Public clinic-card media response.',
  },
  {
    match: { kind: 'pattern', pattern: /^\/[^/]+(?:\/booking)?$/ },
    audience: 'patient',
    why: 'Public clinic card and booking by clinic slug.',
  },
];

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed.startsWith('/')) return '';
  if (trimmed.length === 1) return '/';
  return trimmed.replace(/\/+$/, '') || '/';
}

function pathMatches(pathname: string, match: SurfaceRouteMatch): boolean {
  if (match.kind === 'pattern') return match.pattern.test(pathname);
  if (match.kind === 'exact') return pathname === match.path;
  return pathname === match.path || pathname.startsWith(`${match.path}/`);
}

export function classifySurfaceRoute(pathname: string): SurfaceRouteAudience | null {
  const path = normalizePathname(pathname);
  if (!path) return null;
  for (const rule of SURFACE_ROUTE_RULES) {
    if (pathMatches(path, rule.match)) return rule.audience;
  }
  return null;
}

export function canSurfaceEnterRoute(
  surface: RequestSurface,
  pathname: string,
): boolean {
  if (pathname === '/manifest.webmanifest') {
    return surface === 'patient_default' || surface === 'patient_branded';
  }
  if (pathname === '/manifest-staff.webmanifest') {
    return surface === 'staff' || surface === 'platform_admin';
  }
  if (pathname === '/sw.js' || pathname.startsWith('/api/')) return true;
  if (pathname === '/book/embed.js') {
    return surface === 'patient_default' || surface === 'patient_branded';
  }
  const audience = classifySurfaceRoute(pathname);
  if (!audience) return false;
  if (audience === 'shared') return true;
  if (surface === 'patient_default' || surface === 'patient_branded') {
    return audience === 'patient';
  }
  return audience === 'staff';
}

/**
 * The single patient route projection. Both patient surfaces keep the same physical pages; only
 * the already-resolved context changes which existing page owns a Host-short entry path.
 */
export function patientTreeRewritePath(
  resolved: ResolvedSurface,
  pathname: string,
): string | null {
  const path = normalizePathname(pathname);
  if (resolved.surface === 'patient_default') {
    return path === '/' ? '/app' : null;
  }
  if (resolved.surface !== 'patient_branded' || !resolved.clinicSlug) return null;
  if (path === '/') return publicClinicCardPath(resolved.clinicSlug);
  if (path === '/booking') return publicBookPaths.forSlug(resolved.clinicSlug);
  return null;
}
