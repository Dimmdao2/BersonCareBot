import { redirect } from 'next/navigation';
import { cache } from 'react';
import { NextResponse } from 'next/server';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import {
  ensureDbPrincipalContext,
  enterWithDbPlatformPrincipal,
  enterWithDbPatientPrincipal,
  enterWithDbStaffPrincipal,
  getCurrentDbPrincipal,
} from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getCurrentSession, getCurrentSessionForIdentitySelf } from '@/modules/auth/service';
import {
  patientClientBusinessGate,
  resolvePlatformAccessContext,
} from '@/app-layer/platform-access';
import { canAccessDoctor, canAccessPatient } from '@/modules/roles/service';
import { routePaths } from '@/app-layer/routes/paths';
import { buildOwnHubUrlWithAccessDeniedToast } from '@/shared/lib/appAccessDeniedToast';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import { PLATFORM_OPERATIONS_DB_SOURCE } from '@/shared/security/platformOperationsPrincipal';
import type { AppSession } from '@/shared/types/session';
import type { OrganizationMembershipRole } from '@/modules/organization-membership/ports';
import {
  hasLaunchCapability,
  resolveLaunchCapabilities,
  type LaunchCapability,
} from './workspaceCapabilities';
import { isCabinetEntryBlocked } from './cabinetAccessGate';
import { resolveCabinetAccessRequestLocal } from './cabinetAccessRequestLocal';

export async function requireSession(returnPath?: string): Promise<AppSession> {
  const session = await getCurrentSession();
  if (!session) {
    const query = returnPath ? `?next=${encodeURIComponent(returnPath)}` : '';
    redirect(`${routePaths.root}${query}`);
  }
  return session;
}

/** Сессия для разделов «только для авторизованного» (записи, дневники, покупки). Редирект на /app с ?next= при отсутствии сессии. */
export async function requirePatientAccess(returnPath?: string): Promise<AppSession> {
  const session = await requireSession(returnPath);
  if (!canAccessPatient(session.user.role)) {
    redirect(buildOwnHubUrlWithAccessDeniedToast(session.user.role));
  }
  return session;
}

/** Как requirePatientAccess, плюс бизнес-доступ пациента: tier **patient** из БД (фаза C), без БД — fallback на телефон в сессии. */
export async function requirePatientAccessWithPhone(returnPath?: string): Promise<AppSession> {
  const session = await requirePatientAccess(returnPath);
  await requirePatientBusinessTierOrRedirect(session, returnPath ?? routePaths.patient);
  return session;
}

/** Опциональная сессия пациента: для главного меню, уроков, скорой, контента — можно без входа (гость). Возвращает null, если нет сессии; редирект только если роль не пациент. */
export async function getOptionalPatientSession(): Promise<AppSession | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  if (!canAccessPatient(session.user.role)) {
    redirect(buildOwnHubUrlWithAccessDeniedToast(session.user.role));
  }
  return session;
}

export type PatientRscPersonalDataGate = 'guest' | 'allow';

/**
 * RSC: можно ли грузить персональные данные из БД по `userId` — тот же критерий, что {@link patientClientBusinessGate} / API.
 * Без сессии — `guest` (заглушки). `need_activation` (tier onboarding, не patient) — `guest` для RSC-заглушек;
 * tier **patient** с email/OAuth без телефона — `allow`. `stale_session` — редирект на `/app?next=`.
 */
export async function patientRscPersonalDataGate(
  session: AppSession | null,
  returnTo: string,
): Promise<PatientRscPersonalDataGate> {
  if (!session) return 'guest';
  const g = await patientClientBusinessGate(session);
  if (g === 'stale_session') {
    const next = encodeURIComponent(returnTo);
    redirect(`${routePaths.root}?next=${next}`);
  }
  if (g !== 'allow') return 'guest';
  return 'allow';
}

export async function requireDoctorAccess(): Promise<AppSession> {
  return (await requireDoctorWorkspaceContext()).session;
}

/** Personal staff account entry. It deliberately does not require an organization membership. */
export async function requireStaffAccountPage(): Promise<AppSession> {
  const session = await requireSession();
  const capabilities = resolveLaunchCapabilities({
    sessionRole: session.user.role,
  });
  const restricted = isRestrictedStaffSecuritySession(session);
  if (hasLaunchCapability(capabilities, 'account.self')) {
    // A doctor always resolves account.self, and so does a global admin — owner ruling
    // 2026-07-26: the platform operator manages its own profile,
    // security/2FA, sessions, notifications and PWA install here like any other staff account.
    // This is the ONLY branch a global admin now hits: platform.operations no longer bounces it
    // away from its own account page (that bounce was an unreviewed side effect of the earlier
    // capability collapse, not a decision — see account.md, written the same commit as the old
    // redirect, which already documented account.self as the sole gate here).
    return session;
  }
  if (hasLaunchCapability(capabilities, 'platform.operations')) {
    // Defense in depth only: today every platform.operations holder also resolves account.self
    // above, so this is unreachable unless a future capability change ever separates them again.
    // If it ever does, a recovery-restricted admin still has no other reachable surface to finish
    // its own factor recovery: bouncing to system-health, which itself bounces restricted sessions
    // back to /app, would be an infinite redirect loop — so recovery still wins here.
    if (restricted) return session;
    redirect('/app/admin/system-health');
  }
  if (!restricted) {
    redirect(buildOwnHubUrlWithAccessDeniedToast(session.user.role));
  }
  return session;
}

/**
 * The one personal PWA-install surface is available to a platform operator, but
 * does not turn that operator into a staff account or organization member.
 */
export async function requireStaffPersonalInstallPage(): Promise<AppSession> {
  ensureDbPrincipalContext({ source: 'requireStaffPersonalInstallPage:pending' });
  const session = await getCurrentSessionForIdentitySelf();
  if (!session) redirect(routePaths.root);
  const capabilities = resolveLaunchCapabilities({
    sessionRole: session.user.role,
  });
  if (
    hasLaunchCapability(capabilities, 'account.self') ||
    hasLaunchCapability(capabilities, 'platform.operations')
  ) {
    enterStaffSecuritySelfPrincipal(session.user.userId, 'requireStaffPersonalInstallPage:self');
    return session;
  }
  redirect(buildOwnHubUrlWithAccessDeniedToast(session.user.role));
}

// "recovery" / "recovery_confirmation" only ever follow an ACTUAL verified-factor event — a
// backup-code login (login/factor route) or a freshly-verified TOTP code not yet confirmed with
// its recovery codes (totp/verify route). Both mean the user has proven factor possession at
// least once, so restricting here is real per-user opt-in behavior, independent of the platform
// flag, and must not be weakened (owner constraint: never weaken real 2FA).
function isMidRecoveryStaffSecuritySession(session: AppSession): boolean {
  const assurance = session.staffSecurity?.assurance;
  return assurance === 'recovery' || assurance === 'recovery_confirmation';
}

function requiresEstablishedStaffFactorVerification(session: AppSession): boolean {
  return (
    isMidRecoveryStaffSecuritySession(session) ||
    (session.user.securityFactorRequired === true &&
      session.staffSecurity?.assurance !== 'factor_verified')
  );
}

/** A user who has already proved factor possession must finish its own recovery flow. */
export function isRestrictedStaffSecuritySession(session: AppSession): boolean {
  return requiresEstablishedStaffFactorVerification(session);
}

/** Platform-global DB entry always requires a factor-verified human session. */
function hasVerifiedPlatformOperationsFactor(session: AppSession): boolean {
  return session.staffSecurity?.assurance === 'factor_verified';
}

/**
 * Platform-only RSC entry. It intentionally does not resolve an organization membership.
 *
 * Stamps the dedicated "platform" DB principal (SET ROLE app_platform_settings) best-effort, the
 * same way `requirePlatformOperationsApiContext` already does for the API boundary. Without this,
 * every RSC page under `(global-admin)/doctor/**` (app-settings, technical, auth, integrations,
 * booking, commercial, usage, analytics) rendered with no DB principal beyond the ambient
 * "bootstrap" one. In port-context mode the platform principal routes to the dedicated
 * global-admin mTLS pool; that login can SET only platform-global roles. The patient/pre-session
 * login has no table-level SELECT on system_settings, so every direct
 * `readAdminSystemSettingString`/`listSettingsByScope` read 42501'd with "permission denied for
 * table system_settings" (reproduced live on TEST 2026-07-25, 9 occurrences across these pages in
 * one session) and Next.js surfaced the generic Server Components error page. Stamping "platform"
 * here routes those same reads through the global-admin pool with SET ROLE app_platform_settings, which
 * already holds SELECT/INSERT/UPDATE on system_settings and app_runtime_settings
 * (deploy/postgres/u9a-platform-settings-role.sql) — no new table grant needed for this page.
 */
export async function requirePlatformOperationsPage(): Promise<AppSession> {
  ensureDbPrincipalContext({ source: 'requirePlatformOperationsPage:pending' });
  const session = await requireSession();
  const capabilities = resolveLaunchCapabilities({
    sessionRole: session.user.role,
  });
  if (!hasLaunchCapability(capabilities, 'platform.operations')) {
    redirect('/app');
  }
  if (!hasVerifiedPlatformOperationsFactor(session)) {
    redirect('/app');
  }
  if (isPlatformUserUuid(session.user.userId)) {
    try {
      enterWithDbPlatformPrincipal({
        platformUserId: session.user.userId,
        source: PLATFORM_OPERATIONS_DB_SOURCE,
      });
    } catch {
      // Best-effort, same contract as stampStaffPrincipal: a malformed/dev session id skips
      // stamping rather than 500ing the page. Reads then stay on today's (broken) nonstaff pool
      // instead of getting worse.
    }
  }
  return session;
}

/** Platform-only API boundary. It intentionally has no organization resolution path. */
export async function requirePlatformOperationsApiContext(): Promise<
  { ok: true; session: AppSession } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: 'requirePlatformOperationsApiContext:pending' });
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  const capabilities = resolveLaunchCapabilities({
    sessionRole: session.user.role,
  });
  if (
    !hasLaunchCapability(capabilities, 'platform.operations') ||
    !hasVerifiedPlatformOperationsFactor(session)
  ) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  if (!isPlatformUserUuid(session.user.userId)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  try {
    enterWithDbPlatformPrincipal({
      platformUserId: session.user.userId,
      source: PLATFORM_OPERATIONS_DB_SOURCE,
    });
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  return { ok: true, session };
}

/**
 * Bare `role === 'admin'` API gate, for admin-only endpoints that resolve their own DB principal
 * downstream (or need none) — unlike {@link requirePlatformOperationsApiContext}, it does not stamp
 * the platform DB principal and does not apply the staff-security recovery restriction.
 */
export async function requireAdminApiContext(): Promise<
  { ok: true; session: AppSession } | { ok: false; response: NextResponse }
> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  if (session.user.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  return { ok: true, session };
}

export type DoctorWorkspaceAccessContext = {
  session: AppSession;
  organizationId: string;
  membershipId: string;
  membershipRole: OrganizationMembershipRole;
  specialistId: string | null;
  canManageOrganization: boolean;
  canManageAllSpecialists: boolean;
  canAccessClinicalWorkspace: boolean;
  doctorScreensDisabled: boolean;
  capabilities: readonly LaunchCapability[];
};

function doctorWorkspaceAccessDeniedResponse(reason: string): NextResponse {
  return NextResponse.json({ ok: false, error: reason }, { status: 403 });
}

// Best-effort by contract: staff-principal stamping must never throw. Real prod session ids are
// platform_users UUIDs; legacy/dev/test session ids (e.g. "a1", "admin-1") are not, and would make
// normalizeUuid throw inside enterWithDbStaffPrincipal. A malformed id must skip stamping, not 500 —
// in locked mode a missing principal already fail-closes at the DB port, so skipping stays secure.
function stampStaffPrincipal(
  ctx: Pick<DoctorWorkspaceAccessContext, 'organizationId' | 'session'>,
  source: string,
): void {
  if (!isPlatformUserUuid(ctx.session.user.userId)) return;
  try {
    enterWithDbStaffPrincipal({
      organizationId: ctx.organizationId,
      platformUserId: ctx.session.user.userId,
      source,
    });
  } catch {
    return;
  }
}

async function stampBestEffortStaffPrincipal(session: AppSession, source: string): Promise<void> {
  if (!isPlatformUserUuid(session.user.userId)) return;
  try {
    const resolved = await resolveDoctorWorkspaceAccessContext(session);
    if (!resolved.ok) return;
    stampStaffPrincipal(resolved.ctx, source);
  } catch {
    return;
  }
}

async function stampPatientPrincipalForApi(
  session: AppSession,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  // Best-effort: the lenient isPlatformUserUuid pre-check still lets through ids that fail the
  // stricter RFC-4122 normalizeUuid inside enterWithDbPatientPrincipal (e.g. non-[89ab] variant
  // nibble). Stamping must never throw — a malformed id skips stamping, and in locked mode the DB
  // port already fail-closes without a principal, so skipping stays secure.
  if (!isPlatformUserUuid(session.user.userId)) {
    return { ok: true };
  }

  try {
    const currentPrincipal = getCurrentDbPrincipal();
    const organizationId =
      currentPrincipal?.kind === 'patient' &&
      currentPrincipal.platformUserId === session.user.userId
        ? currentPrincipal.organizationId
        : undefined;
    enterWithDbPatientPrincipal({
      organizationId,
      platformUserId: session.user.userId,
      source: 'requirePatientApiBusinessAccess',
    });
  } catch {
    return { ok: true };
  }
  return { ok: true };
}

async function resolveDoctorWorkspaceAccessContext(
  session: AppSession,
): Promise<
  | { ok: true; ctx: DoctorWorkspaceAccessContext }
  | { ok: false; reason: 'doctor_workspace_membership_required' | 'forbidden' }
> {
  if (requiresEstablishedStaffFactorVerification(session)) {
    return { ok: false, reason: 'forbidden' };
  }
  const resolution = await buildAppDeps().organizationMembership.resolveOrganizationForUser({
    platformUserId: session.user.userId,
  });
  if (!resolution.ok) {
    if (resolution.reason === 'no_active_membership') {
      return { ok: false, reason: 'doctor_workspace_membership_required' };
    }
    return { ok: false, reason: 'forbidden' };
  }
  const { context } = resolution;
  const canAccessClinicalWorkspace =
    context.canAccessClinicalWorkspace ??
    ((context.role === 'owner' || context.role === 'doctor') && context.specialistId !== null);
  return {
    ok: true,
    ctx: {
      session,
      organizationId: context.organizationId,
      membershipId: context.membershipId,
      membershipRole: context.role,
      specialistId: context.specialistId,
      canManageOrganization: context.canManageOrganization,
      canManageAllSpecialists: context.canManageAllSpecialists,
      canAccessClinicalWorkspace,
      doctorScreensDisabled: context.doctorScreensDisabled,
      capabilities: Array.from(
        resolveLaunchCapabilities({
          sessionRole: session.user.role,
                membershipRole: context.role,
          specialistId: context.specialistId,
          canManageOrganization: context.canManageOrganization,
          canAccessClinicalWorkspace,
        }),
      ),
    },
  };
}

function contextHasCapability(
  ctx: DoctorWorkspaceAccessContext,
  capability: LaunchCapability,
): boolean {
  return hasLaunchCapability(ctx.capabilities, capability);
}

/** Resolves an organization membership for both clinical and management surfaces. */
type CabinetGateOptions = { allowCabinetRecovery?: boolean };

async function cabinetEntryIsBlocked(organizationId: string): Promise<boolean> {
  try {
    return isCabinetEntryBlocked(await resolveCabinetAccessRequestLocal(organizationId));
  } catch {
    // The cabinet door is a security/commercial boundary. An unavailable resolver cannot open it.
    return true;
  }
}

const requireOrganizationWorkspaceContextRequestLocal = cache(
  async (allowCabinetRecovery: boolean): Promise<DoctorWorkspaceAccessContext> => {
    ensureDbPrincipalContext({ source: 'requireOrganizationWorkspaceContext:pending' });
    const session = await requireSession();
    if (!canAccessDoctor(session.user.role)) {
      redirect(buildOwnHubUrlWithAccessDeniedToast(session.user.role));
    }
    const accountCapabilities = resolveLaunchCapabilities({
      sessionRole: session.user.role,
    });
    if (hasLaunchCapability(accountCapabilities, 'platform.operations')) {
      redirect('/app/admin/system-health');
    }
    const resolved = await resolveDoctorWorkspaceAccessContext(session);
    if (!resolved.ok) {
      // A staff account without an active organization still owns its personal account.
      redirect(routePaths.account);
    }
    if (
      !contextHasCapability(resolved.ctx, 'organization.management') &&
      !contextHasCapability(resolved.ctx, 'clinical.workspace')
    ) {
      redirect(routePaths.account);
    }
    stampStaffPrincipal(resolved.ctx, 'requireOrganizationWorkspaceContext');
    if (!allowCabinetRecovery && (await cabinetEntryIsBlocked(resolved.ctx.organizationId))) {
      redirect(`${routePaths.settings}?tab=billing`);
    }
    return resolved.ctx;
  },
);

/** Resolves an organization membership and enforces the separate cabinet-entry ladder. */
export async function requireOrganizationWorkspaceContext(
  options: CabinetGateOptions = {},
): Promise<DoctorWorkspaceAccessContext> {
  return requireOrganizationWorkspaceContextRequestLocal(options.allowCabinetRecovery ?? false);
}

/** One-organization management surface: owner/admin capability, independent from specialist binding. */
export async function requireOrganizationManagementContext(): Promise<DoctorWorkspaceAccessContext> {
  const ctx = await requireOrganizationWorkspaceContext();
  if (!contextHasCapability(ctx, 'organization.management')) {
    redirect(routePaths.doctor);
  }
  return ctx;
}

/** Clinical doctor workspace: a bound owner/doctor, never a management-only admin membership. */
export async function requireDoctorWorkspaceContext(): Promise<DoctorWorkspaceAccessContext> {
  const ctx = await requireOrganizationWorkspaceContext();
  if (!contextHasCapability(ctx, 'clinical.workspace')) {
    redirect(
      contextHasCapability(ctx, 'organization.management')
        ? `${routePaths.settings}?tab=organization`
        : routePaths.account,
    );
  }
  return ctx;
}

/** Для Route Handlers под `/api/doctor/*`: doctor или admin. */
export async function requireDoctorApiSession(): Promise<
  { ok: true; session: AppSession } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: 'requireDoctorApiSession:pending' });
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  if (!canAccessDoctor(session.user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  const accountCapabilities = resolveLaunchCapabilities({
    sessionRole: session.user.role,
  });
  if (!hasLaunchCapability(accountCapabilities, 'account.self')) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  if (isRestrictedStaffSecuritySession(session)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'security_setup_required' }, { status: 403 }),
    };
  }
  await stampBestEffortStaffPrincipal(session, 'requireDoctorApiSession');
  return { ok: true, session };
}

/**
 * Any signed-in account, with the narrowest principal that session resolution can prove.
 *
 * Patient and organization staff sessions keep the principal installed by getCurrentSession().
 * Accounts without an organization-derived principal (notably the platform operator and a staff
 * account before joining a clinic) fall back to the identity-self principal instead of inheriting
 * a clinic or platform-wide capability.
 */
export async function requireAuthenticatedApiSession(): Promise<
  { ok: true; session: AppSession } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: 'requireAuthenticatedApiSession:pending' });
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  const currentPrincipal = getCurrentDbPrincipal();
  if (
    (!currentPrincipal ||
      currentPrincipal.kind === 'bootstrap' ||
      currentPrincipal.kind === 'infra' ||
      currentPrincipal.kind === 'integrator') &&
    isPlatformUserUuid(session.user.userId)
  ) {
    try {
      enterStaffSecuritySelfPrincipal(session.user.userId, 'requireAuthenticatedApiSession:self');
    } catch {
      // Keep legacy/dev non-canonical sessions compatible. Locked DB ports still fail closed when
      // no principal can be installed.
    }
  }
  return { ok: true, session };
}

/** Any signed-in account, restricted to its own platform-user identity. */
export async function requireAuthenticatedIdentitySelfApiSession(): Promise<
  { ok: true; session: AppSession } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: 'requireAuthenticatedIdentitySelfApiSession:pending' });
  const session = await getCurrentSessionForIdentitySelf();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  if (isPlatformUserUuid(session.user.userId)) {
    try {
      enterStaffSecuritySelfPrincipal(
        session.user.userId,
        'requireAuthenticatedIdentitySelfApiSession:self',
      );
    } catch {
      // Legacy/dev non-canonical sessions retain their historical behavior. Locked DB ports fail
      // closed if the identity-self principal cannot be installed.
    }
  }
  return { ok: true, session };
}

/**
 * Patient session boundary that deliberately does not require the patient business tier.
 *
 * This is for onboarding/profile APIs that must remain callable while patientClientBusinessGate
 * still resolves `need_activation`. Business data routes must use requirePatientApiBusinessAccess.
 */
export async function requirePatientApiSession(): Promise<
  { ok: true; session: AppSession } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: 'requirePatientApiSession:pending' });
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  const principal = await stampPatientPrincipalForApi(session);
  if (!principal.ok) return principal;
  return { ok: true, session };
}

/**
 * Exact identity-self boundary for the staff PWA subscription endpoints.
 *
 * A platform operator may create, read, or remove a subscription only for the
 * platform user in its authenticated session. This is deliberately not a
 * general `/api/doctor` grant and has no organization-membership resolution.
 */
export async function requireStaffWebPushSelfApiSession(): Promise<
  { ok: true; session: AppSession } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: 'requireStaffWebPushSelfApiSession:pending' });
  const session = await getCurrentSessionForIdentitySelf();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }

  const capabilities = resolveLaunchCapabilities({
    sessionRole: session.user.role,
  });
  if (
    (!hasLaunchCapability(capabilities, 'account.self') &&
      !hasLaunchCapability(capabilities, 'platform.operations')) ||
    isRestrictedStaffSecuritySession(session) ||
    !isPlatformUserUuid(session.user.userId)
  ) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }

  try {
    enterStaffSecuritySelfPrincipal(session.user.userId, 'requireStaffWebPushSelfApiSession:self');
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  return { ok: true, session };
}

/**
 * Identity-self security routes only; never grants organization-wide staff DB context.
 *
 * Deliberately does NOT require `session.staffSecurity` to already be populated on the cookie:
 * a global admin's email-OTP login (`api/auth/email-otp/confirm`) never sets it — there is no
 * `staff_security_profiles` row yet to derive an assurance from — so requiring it here would make
 * TOTP enrollment permanently unreachable for a first-time global admin (audited 2026-07-25).
 * Authorization is principal-based (`enterStaffSecuritySelfPrincipal`, scoped to `session.user.userId`
 * at the DB/RLS layer), not derived from this cookie field, so relaxing it does not widen access.
 */
export async function requireStaffSecurityApiSession(): Promise<
  { ok: true; session: AppSession } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: 'requireStaffSecurityApiSession:pending' });
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  if (!canAccessDoctor(session.user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  enterStaffSecuritySelfPrincipal(session.user.userId, 'requireStaffSecurityApiSession:self');
  return { ok: true, session };
}

/** Для Route Handlers под `/api/doctor/*`: doctor или admin + resolved organization membership. */
export async function requireDoctorWorkspaceApiContext(
  options: CabinetGateOptions = {},
): Promise<
  { ok: true; ctx: DoctorWorkspaceAccessContext } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: 'requireDoctorWorkspaceApiContext:pending' });
  const session = await getCurrentSession();
  if (!session || !canAccessDoctor(session.user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  const resolved = await resolveDoctorWorkspaceAccessContext(session);
  if (!resolved.ok) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse(resolved.reason) };
  }
  if (!contextHasCapability(resolved.ctx, 'clinical.workspace')) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse('forbidden') };
  }
  stampStaffPrincipal(resolved.ctx, 'requireDoctorWorkspaceApiContext');
  if (
    !options.allowCabinetRecovery &&
    (await cabinetEntryIsBlocked(resolved.ctx.organizationId))
  ) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse('cabinet_blocked') };
  }
  return resolved;
}

/** Organization-scoped APIs shared by clinical staff and organization managers. */
export async function requireOrganizationWorkspaceApiContext(
  options: CabinetGateOptions = {},
): Promise<
  { ok: true; ctx: DoctorWorkspaceAccessContext } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: 'requireOrganizationWorkspaceApiContext:pending' });
  const session = await getCurrentSession();
  if (!session || !canAccessDoctor(session.user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  const resolved = await resolveDoctorWorkspaceAccessContext(session);
  if (!resolved.ok) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse(resolved.reason) };
  }
  if (
    !contextHasCapability(resolved.ctx, 'clinical.workspace') &&
    !contextHasCapability(resolved.ctx, 'organization.management')
  ) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse('forbidden') };
  }
  stampStaffPrincipal(resolved.ctx, 'requireOrganizationWorkspaceApiContext');
  if (!options.allowCabinetRecovery && (await cabinetEntryIsBlocked(resolved.ctx.organizationId))) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse('cabinet_blocked') };
  }
  return resolved;
}

/**
 * Legacy organization-scoped repair guard. Despite its historical name, it is
 * not a platform grant: explicit global-admin mode is denied, and the caller
 * must hold organization.management for the one resolved membership.
 */
export async function requireAdminWorkspaceApiContext(
  options: CabinetGateOptions = {},
): Promise<
  { ok: true; ctx: DoctorWorkspaceAccessContext } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: 'requireAdminWorkspaceApiContext:pending' });
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  if (!canAccessDoctor(session.user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  const resolved = await resolveDoctorWorkspaceAccessContext(session);
  if (!resolved.ok) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse(resolved.reason) };
  }
  if (!contextHasCapability(resolved.ctx, 'organization.management')) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse('forbidden') };
  }
  stampStaffPrincipal(resolved.ctx, 'requireAdminWorkspaceApiContext');
  if (
    !options.allowCabinetRecovery &&
    (await cabinetEntryIsBlocked(resolved.ctx.organizationId))
  ) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse('cabinet_blocked') };
  }
  return resolved;
}

/**
 * Для clinic-management API: только management-capable member (`owner`/`admin`) of the
 * resolved organization. Platform admin is a separate capability and cannot inherit an
 * organization workspace through its global-admin role.
 */
export async function requireClinicManagementApiContext(
  options: CabinetGateOptions = {},
): Promise<
  { ok: true; ctx: DoctorWorkspaceAccessContext } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: 'requireClinicManagementApiContext:pending' });
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  if (!canAccessDoctor(session.user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  const resolved = await resolveDoctorWorkspaceAccessContext(session);
  if (!resolved.ok) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse(resolved.reason) };
  }
  if (!contextHasCapability(resolved.ctx, 'organization.management')) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }
  stampStaffPrincipal(resolved.ctx, 'requireClinicManagementApiContext');
  if (
    !options.allowCabinetRecovery &&
    (await cabinetEntryIsBlocked(resolved.ctx.organizationId))
  ) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse('cabinet_blocked') };
  }
  return resolved;
}

/** Есть ли привязка хотя бы одного мессенджера (альтернатива телефону для части сценариев). */
export function hasMessengerBinding(session: AppSession): boolean {
  const b = session.user.bindings;
  return Boolean(b.telegramId?.trim() || b.maxId?.trim() || b.vkId?.trim());
}

async function requirePatientBusinessTierOrRedirect(
  session: AppSession,
  returnTo: string,
): Promise<void> {
  const g = await patientClientBusinessGate(session);
  if (g === 'allow') return;
  const next = encodeURIComponent(returnTo);
  if (g === 'stale_session') {
    redirect(`${routePaths.root}?next=${next}`);
  }
  redirect(`${routePaths.bindPhone}?next=${next}`);
}

function patientActivationRequiredJson(returnPath: string) {
  const next = encodeURIComponent(returnPath);
  return NextResponse.json(
    {
      ok: false,
      error: 'patient_activation_required',
      message: 'Требуется подтверждённый профиль пациента',
      redirectTo: `${routePaths.bindPhone}?next=${next}`,
    },
    { status: 403 },
  );
}

/**
 * Для Route Handlers под `/api/patient/*` и `/api/booking/*`: тот же критерий, что `requirePatientAccessWithPhone`
 * (`patientClientBusinessGate`). Перечень patient-business API — `patientApiPathIsPatientBusinessSurface` в `patientRouteApiPolicy`.
 */
export async function requirePatientApiBusinessAccess(options?: {
  /** Для redirectTo в теле 403 (по умолчанию главное меню пациента). */
  returnPath?: string;
}): Promise<{ ok: true; session: AppSession } | { ok: false; response: NextResponse }> {
  ensureDbPrincipalContext({ source: 'requirePatientApiBusinessAccess:pending' });
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }

  const returnPath = options?.returnPath ?? routePaths.patient;
  const gate = await patientClientBusinessGate(session);
  if (gate === 'stale_session') {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  if (gate === 'need_activation') {
    return { ok: false, response: patientActivationRequiredJson(returnPath) };
  }

  const principal = await stampPatientPrincipalForApi(session);
  if (!principal.ok) {
    return principal;
  }

  return { ok: true, session };
}

/** Как {@link requirePatientApiBusinessAccess}, плюс доверенный телефон (`patient_phone_trust_at`) для native-записи и отмены. */
export async function requirePatientBookingTrustedPhoneAccess(options?: {
  returnPath?: string;
}): Promise<{ ok: true; session: AppSession } | { ok: false; response: NextResponse }> {
  const gate = await requirePatientApiBusinessAccess(options);
  if (!gate.ok) return gate;

  try {
    const ctx = await resolvePlatformAccessContext({
      sessionUserId: gate.session.user.userId,
      sessionRoleHint: gate.session.user.role,
    });
    if (!ctx.phoneTrustedForPatient) {
      const ret = options?.returnPath ?? routePaths.patientBooking;
      const next = encodeURIComponent(ret);
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: 'booking_phone_trust_required',
            message: 'Для записи на приём нужен подтверждённый номер телефона.',
            redirectTo: `${routePaths.bindPhone}?next=${next}`,
          },
          { status: 403 },
        ),
      };
    }
    return { ok: true, session: gate.session };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 }),
    };
  }
}

/** @deprecated Используйте {@link requirePatientApiBusinessAccess}; алиас сохранён для совместимости. */
export const requirePatientApiSessionWithPhone = requirePatientApiBusinessAccess;
