'use server';

import { revalidatePath } from 'next/cache';
import { routePaths } from '@/app-layer/routes/paths';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  entitlementMutationRefusalMessage,
  requireEntitlementForMutationAction,
} from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isHelpSectionSlug } from '@/modules/content-sections/types';
import { contentMechanicForSection } from '@/app-layer/content/warmupsContentMutationGuard';

export type ReorderContentPagesState = { ok: boolean; error?: string };

export async function reorderContentPagesInSection(
  section: string,
  orderedIds: string[],
): Promise<ReorderContentPagesState> {
  const workspace = await requireDoctorWorkspaceContext();
  const sec = section?.trim();
  if (!sec) return { ok: false, error: 'Не указан раздел' };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'Пустой порядок' };
  }
  const ids = orderedIds.map((id) => String(id).trim()).filter(Boolean);
  if (ids.length !== orderedIds.length) return { ok: false, error: 'Некорректные id' };

  const deps = buildAppDeps();
  const sectionRow = await deps.contentSections.getBySlug(sec);
  const mechanic = contentMechanicForSection(sectionRow);
  const entitlement = await requireEntitlementForMutationAction(workspace, mechanic);
  if (!entitlement.ok) {
    return {
      ok: false,
      error: entitlementMutationRefusalMessage(
        mechanic === 'warmups' ? 'изменить контент разминок' : 'изменить контент',
        entitlement.reason,
      ),
    };
  }
  try {
    await withDoctorWorkspacePrincipal(workspace, 'doctor.content.pages.reorder', () =>
      deps.contentPages.reorderInSection(sec, ids),
    );
  } catch (e) {
    console.error('reorderContentPagesInSection', e);
    return { ok: false, error: 'Не удалось сохранить порядок' };
  }

  revalidatePath('/app/doctor/content');
  revalidatePath('/app/patient/content');
  if (isHelpSectionSlug(sec)) {
    revalidatePath(routePaths.patientHelp);
  }
  revalidatePath('/app/patient/sections', 'layout');
  return { ok: true };
}
