import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import type { SystemSettingsService } from '@/modules/system-settings/service';
import {
  WORKSPACE_MODULE_KEYS,
  resolveWorkspaceModuleEffective,
  type WorkspaceModuleAvailability,
  type WorkspaceModuleKey,
} from '@/modules/system-settings/doctorWorkspaceComposition';

/**
 * C3M-01 frozen disabled-route outcome for a workspace module hidden by specialist preference
 * (`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` §C3M.7 C3M-01/C3M-03).
 * C3M slices consume this shared door instead of inventing page-local parsers or response shapes.
 */
export type WorkspaceModuleDisabledReason = 'workspace_module_disabled';

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

const AVAILABLE_AFTER_UPSTREAM_GATES = Object.fromEntries(
  WORKSPACE_MODULE_KEYS.map((key) => [key, true]),
) as WorkspaceModuleAvailability;

/**
 * Product-preference narrowing for an already authorized doctor API/Server Action.
 * Authentication, organization membership and any mechanic entitlement stay upstream; this
 * shared door only reads the canonical structured setting and runs the accepted C3M resolver.
 */
export async function requireWorkspaceModuleForApi(
  workspace: DoctorWorkspaceAccessContext,
  module: WorkspaceModuleKey,
  systemSettings: Pick<SystemSettingsService, 'getDoctorWorkspaceComposition'>,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const composition = await systemSettings.getDoctorWorkspaceComposition({
    organizationId: workspace.organizationId,
  });
  const effective = resolveWorkspaceModuleEffective(composition, AVAILABLE_AFTER_UPSTREAM_GATES);
  return effective[module]
    ? { ok: true }
    : { ok: false, response: workspaceModuleDisabledResponse(module) };
}

/**
 * RSC/direct-page adapter: a workspace-disabled module renders as absent, the same fail-closed
 * outcome `requireEntitlementForPage` already uses for a tariff-disabled mechanic — a disabled
 * feature page is absent, not an explained refusal.
 */
export function requireWorkspaceModuleForPage(effective: boolean): void {
  if (!effective) notFound();
}
