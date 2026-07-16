import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  ensureDbPrincipalContext,
  enterWithDbPatientPrincipal,
  enterWithDbStaffPrincipal,
  getCurrentDbPrincipal,
} from "@bersoncare/db-principal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { patientClientBusinessGate, resolvePlatformAccessContext } from "@/app-layer/platform-access";
import { canAccessDoctor, canAccessPatient } from "@/modules/roles/service";
import { routePaths } from "@/app-layer/routes/paths";
import { buildOwnHubUrlWithAccessDeniedToast } from "@/shared/lib/appAccessDeniedToast";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";
import type { AppSession } from "@/shared/types/session";
import type { OrganizationMembershipRole } from "@/modules/organization-membership/ports";

export async function requireSession(returnPath?: string): Promise<AppSession> {
  const session = await getCurrentSession();
  if (!session) {
    const query = returnPath ? `?next=${encodeURIComponent(returnPath)}` : "";
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

export type PatientRscPersonalDataGate = "guest" | "allow";

/**
 * RSC: можно ли грузить персональные данные из БД по `userId` — тот же критерий, что {@link patientClientBusinessGate} / API.
 * Без сессии — `guest` (заглушки). `need_activation` (tier onboarding, не patient) — `guest` для RSC-заглушек;
 * tier **patient** с email/OAuth без телефона — `allow`. `stale_session` — редирект на `/app?next=`.
 */
export async function patientRscPersonalDataGate(
  session: AppSession | null,
  returnTo: string,
): Promise<PatientRscPersonalDataGate> {
  if (!session) return "guest";
  const g = await patientClientBusinessGate(session);
  if (g === "stale_session") {
    const next = encodeURIComponent(returnTo);
    redirect(`${routePaths.root}?next=${next}`);
  }
  if (g !== "allow") return "guest";
  return "allow";
}

export async function requireDoctorAccess(): Promise<AppSession> {
  ensureDbPrincipalContext({ source: "requireDoctorAccess:pending" });
  const session = await requireSession();
  if (!canAccessDoctor(session.user.role)) {
    redirect(buildOwnHubUrlWithAccessDeniedToast(session.user.role));
  }
  return session;
}

export type DoctorWorkspaceAccessContext = {
  session: AppSession;
  organizationId: string;
  membershipId: string;
  membershipRole: OrganizationMembershipRole;
  specialistId: string | null;
  canManageOrganization: boolean;
  canManageAllSpecialists: boolean;
};

function doctorWorkspaceAccessDeniedResponse(reason: string): NextResponse {
  return NextResponse.json({ ok: false, error: reason }, { status: 403 });
}

// Best-effort by contract: staff-principal stamping must never throw. Real prod session ids are
// platform_users UUIDs; legacy/dev/test session ids (e.g. "a1", "admin-1") are not, and would make
// normalizeUuid throw inside enterWithDbStaffPrincipal. A malformed id must skip stamping, not 500 —
// in locked mode a missing principal already fail-closes at the DB port, so skipping stays secure.
function stampStaffPrincipal(ctx: Pick<DoctorWorkspaceAccessContext, "organizationId" | "session">, source: string): void {
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
      currentPrincipal?.kind === "patient" &&
      currentPrincipal.platformUserId === session.user.userId
        ? currentPrincipal.organizationId
        : undefined;
    enterWithDbPatientPrincipal({
      organizationId,
      platformUserId: session.user.userId,
      source: "requirePatientApiBusinessAccess",
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
  | { ok: false; reason: "doctor_workspace_membership_required" | "forbidden" }
> {
  const resolution = await buildAppDeps().organizationMembership.resolveOrganizationForUser({
    platformUserId: session.user.userId,
  });
  if (!resolution.ok) {
    if (resolution.reason === "no_active_membership") {
      return { ok: false, reason: "doctor_workspace_membership_required" };
    }
    return { ok: false, reason: "forbidden" };
  }
  const { context } = resolution;
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
    },
  };
}

export async function requireDoctorWorkspaceContext(): Promise<DoctorWorkspaceAccessContext> {
  const session = await requireDoctorAccess();
  const resolved = await resolveDoctorWorkspaceAccessContext(session);
  if (!resolved.ok) {
    redirect(buildOwnHubUrlWithAccessDeniedToast(session.user.role));
  }
  stampStaffPrincipal(resolved.ctx, "requireDoctorWorkspaceContext");
  return resolved.ctx;
}

/** Для Route Handlers под `/api/doctor/*`: doctor или admin. */
export async function requireDoctorApiSession(): Promise<
  { ok: true; session: AppSession } | { ok: false; response: NextResponse }
> {
  ensureDbPrincipalContext({ source: "requireDoctorApiSession:pending" });
  const session = await getCurrentSession();
  if (!session || !canAccessDoctor(session.user.role)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  await stampBestEffortStaffPrincipal(session, "requireDoctorApiSession");
  return { ok: true, session };
}

/** Для Route Handlers под `/api/doctor/*`: doctor или admin + resolved organization membership. */
export async function requireDoctorWorkspaceApiContext(): Promise<{ ok: true; ctx: DoctorWorkspaceAccessContext } | { ok: false; response: NextResponse }> {
  ensureDbPrincipalContext({ source: "requireDoctorWorkspaceApiContext:pending" });
  const session = await getCurrentSession();
  if (!session || !canAccessDoctor(session.user.role)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  const resolved = await resolveDoctorWorkspaceAccessContext(session);
  if (!resolved.ok) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse(resolved.reason) };
  }
  stampStaffPrincipal(resolved.ctx, "requireDoctorWorkspaceApiContext");
  return resolved;
}

/** Для Route Handlers под `/api/admin/*`: admin + adminMode + resolved organization membership. */
export async function requireAdminWorkspaceApiContext(): Promise<{ ok: true; ctx: DoctorWorkspaceAccessContext } | { ok: false; response: NextResponse }> {
  ensureDbPrincipalContext({ source: "requireAdminWorkspaceApiContext:pending" });
  const session = await getCurrentSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "admin" || !session.adminMode) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  const resolved = await resolveDoctorWorkspaceAccessContext(session);
  if (!resolved.ok) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse(resolved.reason) };
  }
  stampStaffPrincipal(resolved.ctx, "requireAdminWorkspaceApiContext");
  return resolved;
}

/**
 * Для clinic-management API: platform admin in adminMode OR a management-capable member
 * (`owner`/`admin`) of the resolved organization. Organization is always resolved from the
 * caller's sole active staff membership.
 */
export async function requireClinicManagementApiContext(): Promise<{ ok: true; ctx: DoctorWorkspaceAccessContext } | { ok: false; response: NextResponse }> {
  ensureDbPrincipalContext({ source: "requireClinicManagementApiContext:pending" });
  const session = await getCurrentSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  if (!canAccessDoctor(session.user.role)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  const resolved = await resolveDoctorWorkspaceAccessContext(session);
  if (!resolved.ok) {
    return { ok: false, response: doctorWorkspaceAccessDeniedResponse(resolved.reason) };
  }
  const isGlobalAdmin = session.user.role === "admin" && session.adminMode === true;
  if (!isGlobalAdmin && !resolved.ctx.canManageOrganization) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  stampStaffPrincipal(resolved.ctx, "requireClinicManagementApiContext");
  return resolved;
}

/** Есть ли привязка хотя бы одного мессенджера (альтернатива телефону для части сценариев). */
export function hasMessengerBinding(session: AppSession): boolean {
  const b = session.user.bindings;
  return Boolean(b.telegramId?.trim() || b.maxId?.trim() || b.vkId?.trim());
}

async function requirePatientBusinessTierOrRedirect(session: AppSession, returnTo: string): Promise<void> {
  const g = await patientClientBusinessGate(session);
  if (g === "allow") return;
  const next = encodeURIComponent(returnTo);
  if (g === "stale_session") {
    redirect(`${routePaths.root}?next=${next}`);
  }
  redirect(`${routePaths.bindPhone}?next=${next}`);
}

function patientActivationRequiredJson(returnPath: string) {
  const next = encodeURIComponent(returnPath);
  return NextResponse.json(
    {
      ok: false,
      error: "patient_activation_required",
      message: "Требуется подтверждённый профиль пациента",
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
  ensureDbPrincipalContext({ source: "requirePatientApiBusinessAccess:pending" });
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }

  const returnPath = options?.returnPath ?? routePaths.patient;
  const gate = await patientClientBusinessGate(session);
  if (gate === "stale_session") {
    return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  if (gate === "need_activation") {
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
            error: "booking_phone_trust_required",
            message: "Для записи на приём нужен подтверждённый номер телефона.",
            redirectTo: `${routePaths.bindPhone}?next=${next}`,
          },
          { status: 403 },
        ),
      };
    }
    return { ok: true, session: gate.session };
  } catch {
    return { ok: false, response: NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }) };
  }
}

/** @deprecated Используйте {@link requirePatientApiBusinessAccess}; алиас сохранён для совместимости. */
export const requirePatientApiSessionWithPhone = requirePatientApiBusinessAccess;
