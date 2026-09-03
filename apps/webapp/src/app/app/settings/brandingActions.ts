'use server';

import { revalidatePath } from 'next/cache';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireOrgBrandingManagementContext } from '@/app-layer/guards/requireOrgBrandingManagementContext';
import { safeActionErrorCode } from '@/shared/http/apiResponse';

type ActionState = { ok: true } | { ok: false; error: string };

function fail(error: string): ActionState {
  return { ok: false, error };
}

/**
 * The clinic name shows in the doctor/patient shell brand mark (`DoctorAdminSidebar`) and the
 * settings page itself; the public page will read the same published revision once it exists
 * (BRANDING_DOMAIN_CONTRACT.md, owner decision 2026-07-25).
 */
function revalidateOrgBrandingSurfaces(): void {
  revalidatePath('/app/settings');
  revalidatePath('/app/doctor', 'layout');
  revalidatePath('/app/patient', 'layout');
}

/**
 * UX-05 B2 — the single save action for the clinic brand editing surface. The owner ruled the user
 * must never see the word "revision": one click here both saves the draft and publishes it,
 * archiving whatever was published before (BRANDING_DOMAIN_CONTRACT.md "Owner decisions on the
 * brand editing UI", 2026-07-25) — versioning stays an implementation detail behind one "Сохранить"
 * action. `requireOrgBrandingManagementContext()` is the ONLY source of the organization id here
 * (never trusts a client-supplied value), and the underlying service re-checks the `branding`
 * entitlement on every call — this action performs no entitlement check of its own (one chokepoint).
 */
export async function saveOrgBranding(input: {
  displayName: string | null;
  logoMediaId: string | null;
}): Promise<ActionState> {
  try {
    const ctx = await requireOrgBrandingManagementContext();
    const deps = buildAppDeps();
    const draftResult = await deps.orgBranding.saveDraft(ctx, {
      displayName: input.displayName,
      logoMediaId: input.logoMediaId,
    });
    if (!draftResult.ok) return fail(draftResult.code);
    const publishResult = await deps.orgBranding.publishDraft(ctx);
    if (!publishResult.ok) return fail(publishResult.code);
    revalidateOrgBrandingSurfaces();
    return { ok: true };
  } catch (error) {
    return fail(safeActionErrorCode(error, 'save_failed', 'org_branding_save_failed'));
  }
}
