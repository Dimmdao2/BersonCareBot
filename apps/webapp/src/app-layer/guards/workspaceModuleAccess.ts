import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import {
  getCurrentDbPrincipalOrganizationId,
  runWithDbPatientPrincipal,
} from '@bersoncare/db-principal';
import { TypedApiResponseError } from '@/shared/http/apiResponse';
import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import { resolveMechanicAccess } from '@/modules/org-entitlements/service';
import {
  resolveWorkspaceModuleEffective,
  WORKSPACE_MODULE_KEYS,
  type WorkspaceModuleAvailability,
  type WorkspaceModuleEffective,
  type WorkspaceModuleKey,
} from '@/modules/system-settings/doctorWorkspaceComposition';
import {
  isClientChannelAllowed,
  type ClientChannelPolicy,
} from '@/modules/doctor-clients/supportPolicy';

type AppDeps = ReturnType<typeof buildAppDeps>;

const ALL_WORKSPACE_MODULES_AVAILABLE = Object.fromEntries(
  WORKSPACE_MODULE_KEYS.map((key) => [key, true]),
) as WorkspaceModuleAvailability;

function mechanicIsVisible(resolution: Awaited<ReturnType<typeof resolveMechanicAccess>>): boolean {
  return (
    resolution.state === 'full_access' ||
    resolution.state === 'grace' ||
    resolution.state === 'read_only'
  );
}

/**
 * C3M-01 frozen disabled-route outcome for a workspace module hidden by specialist preference
 * (`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` §C3M.7 C3M-01/C3M-03).
 * C3M-06+ projections consume this door for sidebar/card-tab/direct-route/API enforcement instead
 * of inventing a second response shape.
 */
export type WorkspaceModuleDisabledReason = 'workspace_module_disabled';

/**
 * Central API projection for the rehabilitation slice. `proxy.ts` overwrites `x-bc-pathname`
 * from the real request URL, so callers cannot select a weaker module. Child routes are matched
 * before their rehabilitation parent and therefore retain their own stored preference as well.
 */
export function workspaceModuleForApiPath(pathname: string): WorkspaceModuleKey | null {
  if (
    pathname.startsWith('/api/doctor/messages') ||
    pathname.startsWith('/api/patient/messages') ||
    /^\/api\/doctor\/patients\/[^/]+\/messages-snapshot(?:\/|$)/.test(pathname)
  ) {
    return 'direct_chat';
  }
  if (pathname.startsWith('/api/patient/media/program-submission')) return 'program_media';
  if (
    /^\/api\/patient\/treatment-program-instances\/[^/]+\/(?:discussion|items\/[^/]+\/discussion)(?:\/|$)/.test(
      pathname,
    )
  ) {
    return pathname.includes('/discussion/media') ? 'program_media' : 'program_comments';
  }
  if (
    /^\/api\/patient\/treatment-program-instances\/[^/]+\/items\/[^/]+\/progress\/observation-note(?:\/|$)/.test(
      pathname,
    )
  ) {
    return 'program_comments';
  }
  if (
    pathname.startsWith('/api/patient/treatment-program-instances') ||
    pathname.startsWith('/api/patient/treatment-program-promo') ||
    pathname.startsWith('/api/patient/courses') ||
    pathname.startsWith('/api/patient/diary/lfk-stats')
  ) {
    return 'rehabilitation';
  }
  if (
    pathname.startsWith('/api/patient/diary/') ||
    pathname.startsWith('/api/patient/profile/') ||
    pathname.startsWith('/api/patient/email-change/') ||
    pathname.startsWith('/api/patient/organization-context') ||
    pathname.startsWith('/api/patient/pwa/') ||
    pathname.startsWith('/api/patient/web-push/') ||
    pathname.startsWith('/api/patient/analytics/')
  ) {
    return null;
  }
  if (
    pathname.startsWith('/api/patient/daily-warmup/') ||
    pathname.startsWith('/api/patient/material-ratings') ||
    pathname.startsWith('/api/patient/practice/') ||
    pathname.startsWith('/api/patient/reminders/')
  ) {
    return 'client_portal';
  }
  if (
    /^\/api\/doctor\/treatment-program-instances\/[^/]+\/discussion\/messages\/[^/]+(?:\/|$)/.test(
      pathname,
    )
  ) {
    return 'program_media';
  }
  if (
    pathname.startsWith('/api/doctor/comments') ||
    pathname.startsWith('/api/doctor/exercise-comments') ||
    /^\/api\/doctor\/patients\/[^/]+\/program-activity(?:\/|$)/.test(pathname)
  ) {
    return 'program_comments';
  }
  if (
    /^\/api\/doctor\/treatment-program-instances\/[^/]+\/(?:discussion|items\/[^/]+\/(?:discussion|program-note-reply))(?:\/|$)/.test(
      pathname,
    )
  ) {
    return 'program_comments';
  }
  if (/^\/api\/doctor\/treatment-program-instances\/[^/]+\/media-presign(?:\/|$)/.test(pathname)) {
    return 'program_media';
  }
  if (
    pathname.startsWith('/api/doctor/clinical-tests') ||
    pathname.startsWith('/api/doctor/recommendations') ||
    pathname.startsWith('/api/doctor/references') ||
    pathname.startsWith('/api/doctor/test-sets') ||
    pathname.startsWith('/api/doctor/treatment-program-instances') ||
    pathname.startsWith('/api/doctor/treatment-program-templates') ||
    pathname.startsWith('/api/doctor/treatment-program-promo') ||
    pathname.startsWith('/api/doctor/pending-program-tests') ||
    /^\/api\/doctor\/(?:clients|patients)\/[^/]+\/(?:exercise-calendar|lfk-complex-exercises|program-day-activity|treatment-program-instances)(?:\/|$)/.test(
      pathname,
    )
  ) {
    return 'rehabilitation';
  }
  return null;
}

/**
 * API route / Server Action refusal. Same 403 envelope shape as the tariff-entitlement refusal
 * (`entitlementMutationRefusalResponse` in `requireEntitlement.ts`), so a client-side error handler
 * does not need a second case for a workspace-disabled module versus a tariff-disabled mechanic.
 */
export function workspaceModuleDisabledResponse(module: WorkspaceModuleKey): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: 'workspace_module_disabled' satisfies WorkspaceModuleDisabledReason,
      module,
    },
    { status: 403 },
  );
}

/** Server Action transport of the same frozen 403 refusal. */
export function workspaceModuleDisabledError(module: WorkspaceModuleKey): TypedApiResponseError {
  return new TypedApiResponseError({
    code: 'workspace_module_disabled',
    status: 403,
    publicFields: { module },
  });
}

/**
 * The accepted C3M resolver projected for a specialist request. Existing actor/capability and
 * entitlement availability are resolved first; workspace preference can only narrow that map.
 * Both the shell and non-page doors use this function so rehabilitation has one gate.
 */
export async function resolveDoctorWorkspaceModules(
  deps: Pick<AppDeps, 'orgEntitlements' | 'systemSettings'>,
  workspace: DoctorWorkspaceAccessContext,
  preloadedCompositionRow?: Parameters<
    AppDeps['systemSettings']['getDoctorWorkspaceComposition']
  >[1],
): Promise<WorkspaceModuleEffective> {
  const [exerciseCatalog, mailings, analytics, patientApp, videoMeetings, composition] = await Promise.all([
    resolveMechanicAccess(deps.orgEntitlements, workspace.organizationId, 'exercise_catalog'),
    resolveMechanicAccess(deps.orgEntitlements, workspace.organizationId, 'mailings'),
    resolveMechanicAccess(deps.orgEntitlements, workspace.organizationId, 'doctor_statistics'),
    resolveMechanicAccess(deps.orgEntitlements, workspace.organizationId, 'patient_app'),
    resolveMechanicAccess(deps.orgEntitlements, workspace.organizationId, 'video_meetings'),
    deps.systemSettings.getDoctorWorkspaceComposition(
      {
        organizationId: workspace.organizationId,
      },
      preloadedCompositionRow,
    ),
  ]);
  const clinical = workspace.canAccessClinicalWorkspace;
  return resolveWorkspaceModuleEffective(composition, {
    medical_record: clinical,
    encounters: clinical,
    rehabilitation: clinical && mechanicIsVisible(exerciseCatalog),
    direct_chat: clinical,
    program_comments: clinical,
    program_media: clinical,
    mailings: clinical && mechanicIsVisible(mailings),
    analytics: clinical && mechanicIsVisible(analytics),
    client_portal: clinical && mechanicIsVisible(patientApp),
    video_meetings: clinical && mechanicIsVisible(videoMeetings),
  });
}

/**
 * Canonical API projection for callers that preserve an independent surface while omitting data
 * owned by a disabled workspace module (for example appointments without encounter links).
 * It delegates to the same entitlement-aware specialist resolver instead of folding preferences
 * through a second availability formula.
 */
export async function resolveWorkspaceModulesForApi(
  workspace: DoctorWorkspaceAccessContext,
  deps: Pick<AppDeps, 'orgEntitlements' | 'systemSettings'>,
): Promise<WorkspaceModuleEffective> {
  return resolveDoctorWorkspaceModules(deps, workspace);
}

/**
 * Patient/service projection after the existing enrollment/target authorization established the
 * organization. Those prior boundaries remain authoritative; this resolver applies the stored
 * workspace preference, its frozen parent dependencies and the tariff mechanics that own a module.
 */
export async function resolveOrganizationWorkspaceModules(
  deps: Pick<AppDeps, 'systemSettings' | 'orgEntitlements'>,
  organizationId: string,
): Promise<WorkspaceModuleEffective> {
  // Владелец 11.09 (EXERCISE_STORE_PLAN §2 п.22): «у доктора и у его пациентов раздела ЛФК нет вообще».
  // Пациентская проекция тариф не спрашивала совсем (ALL_WORKSPACE_MODULES_AVAILABLE), поэтому при
  // выключенной механике пациентский API реабилитации продолжал отвечать — дыра, найденная слепым
  // аудитом 11.09. Сужение берёт тот же `resolveMechanicAccess`, что и врачебный резолвер выше, а не
  // вторую формулу доступности.
  const [composition, exerciseCatalog] = await Promise.all([
    deps.systemSettings.getDoctorWorkspaceComposition({ organizationId }),
    resolveMechanicAccess(deps.orgEntitlements, organizationId, 'exercise_catalog'),
  ]);
  return resolveWorkspaceModuleEffective(composition, {
    ...ALL_WORKSPACE_MODULES_AVAILABLE,
    rehabilitation: mechanicIsVisible(exerciseCatalog),
  });
}

/** Client policy is a final narrowing projection; it never recreates an unavailable parent. */
export function applyClientChannelPolicyToWorkspaceModules(
  modules: WorkspaceModuleEffective,
  policy: ClientChannelPolicy,
): WorkspaceModuleEffective {
  const clientPortal = modules.client_portal && policy.portalAllowed !== false;
  return {
    ...modules,
    client_portal: clientPortal,
    direct_chat:
      clientPortal && modules.direct_chat && isClientChannelAllowed(policy, 'directChatAllowed'),
    program_comments:
      clientPortal && modules.program_comments && isClientChannelAllowed(policy, 'commentsAllowed'),
    program_media:
      clientPortal && modules.program_media && isClientChannelAllowed(policy, 'mediaAllowed'),
  };
}

export async function requireDoctorWorkspaceModuleForApi(
  deps: Pick<AppDeps, 'orgEntitlements' | 'systemSettings'>,
  workspace: DoctorWorkspaceAccessContext,
  module: WorkspaceModuleKey,
): Promise<
  { ok: true; modules: WorkspaceModuleEffective } | { ok: false; response: NextResponse }
> {
  const modules = await resolveDoctorWorkspaceModules(deps, workspace);
  return modules[module]
    ? { ok: true, modules }
    : { ok: false, response: workspaceModuleDisabledResponse(module) };
}

export async function requireOrganizationWorkspaceModuleForApi(
  deps: Pick<AppDeps, 'systemSettings' | 'orgEntitlements'>,
  organizationId: string,
  module: WorkspaceModuleKey,
): Promise<
  { ok: true; modules: WorkspaceModuleEffective } | { ok: false; response: NextResponse }
> {
  const modules = await resolveOrganizationWorkspaceModules(deps, organizationId);
  return modules[module]
    ? { ok: true, modules }
    : { ok: false, response: workspaceModuleDisabledResponse(module) };
}

export async function requirePatientWorkspaceModuleForApi(
  deps: Pick<
    AppDeps,
    'patientOrganization' | 'systemSettings' | 'doctorClients' | 'orgEntitlements'
  >,
  patientUserId: string,
  module: WorkspaceModuleKey,
): Promise<
  | { ok: true; modules: WorkspaceModuleEffective; organizationId: string }
  | { ok: false; response: NextResponse }
> {
  if (!deps.patientOrganization) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'patient_organization_unavailable' },
        { status: 503 },
      ),
    };
  }
  const resolved = await deps.patientOrganization.resolveActiveOrganizationForPatient(
    patientUserId,
    { rememberedOrganizationId: getCurrentDbPrincipalOrganizationId() ?? null },
  );
  if (!resolved.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: resolved.reason },
        { status: resolved.reason === 'organization_selection_required' ? 409 : 403 },
      ),
    };
  }
  const moduleGate = await runWithDbPatientPrincipal(
    {
      platformUserId: patientUserId,
      organizationId: resolved.organizationId,
      source: 'patient-workspace-module-guard',
    },
    async () => {
      const workspaceModules = await resolveOrganizationWorkspaceModules(
        deps,
        resolved.organizationId,
      );
      const modules = applyClientChannelPolicyToWorkspaceModules(
        workspaceModules,
        await deps.doctorClients.getClientChannelPolicy(patientUserId, {
          organizationId: resolved.organizationId,
        }),
      );
      return modules[module]
        ? { ok: true as const, modules }
        : { ok: false as const, response: workspaceModuleDisabledResponse(module) };
    },
  );
  return moduleGate.ok
    ? { ok: true, modules: moduleGate.modules, organizationId: resolved.organizationId }
    : moduleGate;
}

export async function requireDoctorWorkspaceModuleForAction(
  deps: Pick<AppDeps, 'orgEntitlements' | 'systemSettings'>,
  workspace: DoctorWorkspaceAccessContext,
  module: WorkspaceModuleKey,
): Promise<WorkspaceModuleEffective> {
  const modules = await resolveDoctorWorkspaceModules(deps, workspace);
  if (!modules[module]) throw workspaceModuleDisabledError(module);
  return modules;
}

export async function requirePatientWorkspaceModuleForAction(
  deps: Pick<
    AppDeps,
    'patientOrganization' | 'systemSettings' | 'doctorClients' | 'orgEntitlements'
  >,
  patientUserId: string,
  module: WorkspaceModuleKey,
): Promise<WorkspaceModuleEffective> {
  const gate = await requirePatientWorkspaceModuleForApi(deps, patientUserId, module);
  if (!gate.ok) throw workspaceModuleDisabledError(module);
  return gate.modules;
}
/**
 * RSC/direct-page adapter: a workspace-disabled module renders as absent, the same fail-closed
 * outcome `requireEntitlementForPage` already uses for a tariff-disabled mechanic — a disabled
 * feature page is absent, not an explained refusal.
 */
export function requireWorkspaceModuleForPage(effective: boolean): void {
  if (!effective) notFound();
}
