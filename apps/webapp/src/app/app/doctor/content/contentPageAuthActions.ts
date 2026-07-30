'use server';

import { revalidatePath } from 'next/cache';
import { revalidatePatientContentPaths } from '@/app-layer/content/revalidatePatientContentPaths';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForMutationAction } from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  isWarmupsContentSection,
  warmupsContentMutationRefusal,
} from '@/app-layer/content/warmupsContentMutationGuard';

export type ContentPageAuthState = { ok: boolean; error?: string };

export async function setContentPageRequiresAuth(
  id: string,
  requiresAuth: boolean,
): Promise<ContentPageAuthState> {
  const workspace = await requireDoctorWorkspaceContext();
  const entitlement = await requireEntitlementForMutationAction(workspace, 'cms_pages');
  if (!entitlement.ok) return { ok: false, error: entitlement.reason };
  const pageId = id?.trim();
  if (!pageId) return { ok: false, error: 'Нет id' };

  const deps = buildAppDeps();
  const page = await withDoctorWorkspacePrincipal(
    workspace,
    'doctor.content.page.requires-auth.read',
    () => deps.contentPages.getById(pageId),
  );
  const section = page ? await deps.contentSections.getBySlug(page.section) : null;
  if (isWarmupsContentSection(section)) {
    const refusal = await warmupsContentMutationRefusal(workspace);
    if (refusal) return { ok: false, error: refusal };
  }
  try {
    await withDoctorWorkspacePrincipal(workspace, 'doctor.content.page.requires-auth', () =>
      deps.contentPages.updateLifecycle(pageId, { requiresAuth }),
    );
  } catch (e) {
    console.error('setContentPageRequiresAuth', e);
    return { ok: false, error: 'Не удалось обновить доступ' };
  }

  revalidatePath('/app/doctor/content');
  revalidatePath('/app/patient');
  if (page) {
    revalidatePatientContentPaths({ slug: page.slug, section: page.section });
  } else {
    revalidatePath('/app/patient/sections', 'layout');
  }
  return { ok: true };
}
