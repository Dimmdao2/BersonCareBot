import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import type { WorkspaceModuleKey } from '@/modules/system-settings/doctorWorkspaceComposition';

/**
 * C3M-01 frozen disabled-route outcome for a workspace module hidden by specialist preference
 * (`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` §C3M.7 C3M-01/C3M-03).
 * Foundation-only: no route in this stage calls these — later C3M-06+ slices that actually wire
 * sidebar/card-tab/direct-route/API guards consume this door instead of inventing a second shape.
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

/**
 * RSC/direct-page adapter: a workspace-disabled module renders as absent, the same fail-closed
 * outcome `requireEntitlementForPage` already uses for a tariff-disabled mechanic — a disabled
 * feature page is absent, not an explained refusal.
 */
export function requireWorkspaceModuleForPage(effective: boolean): void {
  if (!effective) notFound();
}
