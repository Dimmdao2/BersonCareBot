import { routePaths } from '@/app-layer/routes/paths';
import {
  arePlatformSurfaceHostsDistinct,
  type RequestSurface,
  type ResolvedSurface,
} from '@/shared/lib/surface/requestSurface';
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
    match: { kind: 'exact', path: '/live' },
    audience: 'patient',
    why: 'Guest meeting joins use a fragment capability on the branded patient host.',
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
    match: { kind: 'prefix', path: '/app/protect-account' },
    audience: 'shared',
    why: 'Account protection from an email is available before login on every staff surface.',
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
    match: { kind: 'pattern', pattern: /^\/[^/]+\/specialist\/[^/]+$/ },
    audience: 'patient',
    why: 'Public specialist page of a clinic card (#926 §17.G).',
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

export function canSurfaceEnterRoute(surface: RequestSurface, pathname: string): boolean {
  // Role-login paths are browser doors for one product surface each. The path itself never
  // chooses a surface, but accepting another surface's door would present the wrong product
  // before the post-auth role guard has a chance to run.
  if (pathname === '/app/doctor/login' || pathname === '/app/doctor/register') {
    return surface === 'staff';
  }
  if (pathname === '/app/admin/login') return surface === 'platform_admin';
  if (pathname === '/app/patient/login') {
    return surface === 'patient_default' || surface === 'patient_branded';
  }
  if (pathname === '/manifest.webmanifest') {
    return (
      surface === 'patient_default' ||
      surface === 'patient_branded' ||
      (surface === 'staff' && !arePlatformSurfaceHostsDistinct())
    );
  }
  if (pathname === '/manifest-staff.webmanifest') {
    return surface === 'staff';
  }
  if (pathname === '/manifest-admin.webmanifest') {
    return surface === 'platform_admin';
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
export function patientTreeRewritePath(resolved: ResolvedSurface, pathname: string): string | null {
  const path = normalizePathname(pathname);
  if (resolved.surface === 'patient_default') {
    return path === '/' ? routePaths.root : null;
  }
  if (resolved.surface !== 'patient_branded' || !resolved.clinicSlug) return null;
  // Владелец 12.09.2026, дословно: «app clinic ru не должен вести на публичную карточку клиники.
  // Он должен в любом случае открывать логин всегда. Публичная карточка клиники как была, так и
  // остаётся на поддомене therapygo.ru». Корень решает не настройка, а АДРЕС, с которого пришли:
  // собственный домен клиники — её приложение, платформенный поддомен — её витрина. Снятый ключ,
  // которым это выбиралось раньше, — `clinic_root_skip_public_card`.
  // Куда именно на собственном домене — решено 15.09, когда владелец объяснил, ЗАЧЕМ этот корень
  // существует: «у меня есть люди, которые сейчас живут на приложении bersoncare.ru… у них уже на
  // телефоны установлены их приложения… надо, чтобы они работали так же… А если люди открывают
  // установленное приложение, у них в манифесте стартовая страница именно в веб-приложении — это
  // app slash patient. Соответственно, они должны туда и попасть… Но пока это не лендинг, он
  // должен перенаправлять сразу». Поэтому корень ведёт не в общий выбор портала (`/app`), а прямо
  // в пациентское приложение — тот же адрес, что стоит `start_url` в манифесте. Решение 12.09
  // («в любом случае открывать логин всегда», не публичную карточку) этим не нарушено: `/app/patient`
  // неавторизованного сам уводит на пациентский вход. Когда на корне появится настоящий лендинг,
  // меняется ровно эта строка.
  if (path === '/') {
    return resolved.brandedHostIsOwnDomain
      ? routePaths.patient
      : publicClinicCardPath(resolved.clinicSlug);
  }
  if (path === '/booking') return publicBookPaths.forSlug(resolved.clinicSlug);
  return null;
}

/**
 * The one platform-admin root projection. `/` is deliberately `shared` in `SURFACE_ROUTE_RULES`
 * above — it does not choose between staff, patient or admin — so without this, `platform_admin`
 * fell through to the exact same staff marketing landing as `therapysto.ru` itself (C16 gap,
 * `SURFACE_AND_DOMAIN_MAP_2026-08-22.md`: "Host isolation/redirect отсутствуют"; found live
 * 12.09.2026 — `admin.therapysto.ru` showed the specialist landing, not a login form). The admin
 * Host has exactly one door (`canSurfaceEnterRoute` already hard-404s every other role-login path
 * on it), so root goes straight there — no landing, no portal choice to make.
 */
export function platformAdminRewritePath(resolved: ResolvedSurface, pathname: string): string | null {
  if (resolved.surface !== 'platform_admin') return null;
  return normalizePathname(pathname) === '/' ? '/app/admin/login' : null;
}
