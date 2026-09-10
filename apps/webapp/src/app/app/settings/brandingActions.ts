'use server';

import { revalidatePath } from 'next/cache';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireOrgBrandingManagementContext } from '@/app-layer/guards/requireOrgBrandingManagementContext';
import { requireEntitlementForMutationAction } from '@/app-layer/guards/requireEntitlement';
import { safeActionFailure, type ActionFailureFields } from '@/shared/http/apiResponse';
import { writeOrgAppIconRenditions } from '@/app-layer/media/orgAppIconRenditions';

type ActionState = { ok: true } | ({ ok: false } & ActionFailureFields);

/** A code this action owns, or the shared door's verdict (code plus its support reference). */
function fail(failure: string | ActionFailureFields): ActionState {
  return typeof failure === 'string' ? { ok: false, error: failure } : { ok: false, ...failure };
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
  /** Отсутствие поля сохраняет прежнюю иконку; `null` — снять её. */
  appIconMediaId?: string | null;
}): Promise<ActionState> {
  try {
    const ctx = await requireOrgBrandingManagementContext();
    const entitlement = await requireEntitlementForMutationAction(ctx, 'branding');
    if (!entitlement.ok) {
      return fail(
        entitlement.reason === 'commercial_read_only'
          ? 'commercial_read_only'
          : 'entitlement_disabled',
      );
    }
    const deps = buildAppDeps();
    const draftResult = await deps.orgBranding.saveDraft(ctx, {
      displayName: input.displayName,
      logoMediaId: input.logoMediaId,
      ...(Object.prototype.hasOwnProperty.call(input, 'appIconMediaId')
        ? { appIconMediaId: input.appIconMediaId ?? null }
        : {}),
    });
    if (!draftResult.ok) return fail(draftResult.code);
    // Владелец: «в идеале сразу при установке или смене и переформатируется под фавикон и все
    // остальные форматы». Поэтому размеры считаются ЗДЕСЬ, до публикации: пока их нет, публиковать
    // иконку нечем, и брендированная поверхность честно осталась бы на платформенном наборе.
    // Отказ виден врачу сразу, а не превращается в молча пропавшую иконку.
    if (draftResult.draft.appIconMediaId) {
      const renditions = await writeOrgAppIconRenditions(draftResult.draft.appIconMediaId);
      if (!renditions.ok) return fail(`app_icon_${renditions.reason}`);
    }
    const publishResult = await deps.orgBranding.publishDraft(ctx);
    if (!publishResult.ok) return fail(publishResult.code);
    revalidateOrgBrandingSurfaces();
    return { ok: true };
  } catch (error) {
    return fail(safeActionFailure(error, 'save_failed', 'org_branding_save_failed'));
  }
}
