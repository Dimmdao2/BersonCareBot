'use server';

import { revalidatePath } from 'next/cache';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  entitlementMutationRefusalMessage,
  requireEntitlementForMutationAction,
} from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  isWarmupsContentSection,
  warmupsContentMutationRefusal,
} from '@/app-layer/content/warmupsContentMutationGuard';

export type SectionVisibilityState = { ok: boolean; error?: string };

export async function setSectionRequiresAuth(
  slug: string,
  requiresAuth: boolean,
): Promise<SectionVisibilityState> {
  const workspace = await requireDoctorWorkspaceContext();
  const entitlement = await requireEntitlementForMutationAction(workspace, 'cms_pages');
  if (!entitlement.ok) {
    return {
      ok: false,
      error: entitlementMutationRefusalMessage('изменить контент', entitlement.reason),
    };
  }
  const s = slug?.trim();
  if (!s) return { ok: false, error: 'Нет slug' };

  const deps = buildAppDeps();
  const section = await deps.contentSections.getBySlug(s);
  if (isWarmupsContentSection(section)) {
    const refusal = await warmupsContentMutationRefusal(workspace);
    if (refusal) return { ok: false, error: refusal };
  }
  try {
    await withDoctorWorkspacePrincipal(workspace, 'doctor.content.section.requires-auth', () =>
      deps.contentSections.update(s, { requiresAuth }),
    );
  } catch (e) {
    console.error('setSectionRequiresAuth', e);
    return { ok: false, error: 'Не удалось обновить доступ' };
  }

  revalidatePath('/app/doctor/content/sections');
  revalidatePath('/app/doctor/content');
  revalidatePath('/app/patient');
  revalidatePath('/app/patient/sections', 'layout');
  revalidatePath('/api/menu');
  return { ok: true };
}

export async function setSectionVisibility(
  slug: string,
  isVisible: boolean,
): Promise<SectionVisibilityState> {
  const workspace = await requireDoctorWorkspaceContext();
  const entitlement = await requireEntitlementForMutationAction(workspace, 'cms_pages');
  if (!entitlement.ok) {
    return {
      ok: false,
      error: entitlementMutationRefusalMessage('изменить контент', entitlement.reason),
    };
  }
  const s = slug?.trim();
  if (!s) return { ok: false, error: 'Нет slug' };

  const deps = buildAppDeps();
  const section = await deps.contentSections.getBySlug(s);
  if (isWarmupsContentSection(section)) {
    const refusal = await warmupsContentMutationRefusal(workspace);
    if (refusal) return { ok: false, error: refusal };
  }
  try {
    await withDoctorWorkspacePrincipal(workspace, 'doctor.content.section.visibility', () =>
      deps.contentSections.update(s, { isVisible }),
    );
  } catch (e) {
    console.error('setSectionVisibility', e);
    return { ok: false, error: 'Не удалось обновить видимость' };
  }

  revalidatePath('/app/doctor/content/sections');
  revalidatePath('/app/doctor/content');
  revalidatePath('/app/patient');
  revalidatePath('/app/patient/sections', 'layout');
  revalidatePath('/api/menu');
  return { ok: true };
}
