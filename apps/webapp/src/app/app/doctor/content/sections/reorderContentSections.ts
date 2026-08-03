'use server';

import { revalidatePath } from 'next/cache';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  entitlementMutationRefusalMessage,
  requireEntitlementForMutationAction,
} from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { contentMechanicForSection } from '@/app-layer/content/warmupsContentMutationGuard';

export type ReorderContentSectionsState = { ok: boolean; error?: string };

export async function reorderContentSections(
  orderedSlugs: string[],
): Promise<ReorderContentSectionsState> {
  const workspace = await requireDoctorWorkspaceContext();
  if (!Array.isArray(orderedSlugs) || orderedSlugs.length === 0) {
    return { ok: false, error: 'Пустой порядок' };
  }
  const slugs = orderedSlugs.map((s) => String(s).trim()).filter(Boolean);
  if (slugs.length !== orderedSlugs.length) return { ok: false, error: 'Некорректные slug' };

  const deps = buildAppDeps();
  const sections = await deps.contentSections.listAll();
  const involvedMechanics = new Set(
    sections
      .filter((section) => slugs.includes(section.slug))
      .map((section) => contentMechanicForSection(section)),
  );
  if (involvedMechanics.size === 0) involvedMechanics.add('cms_pages');
  for (const mechanic of involvedMechanics) {
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
  }
  try {
    await withDoctorWorkspacePrincipal(workspace, 'doctor.content.sections.reorder', () =>
      deps.contentSections.reorderSlugs(slugs),
    );
  } catch (e) {
    console.error('reorderContentSections', e);
    return { ok: false, error: 'Не удалось сохранить порядок' };
  }

  revalidatePath('/app/doctor/content/sections');
  revalidatePath('/app/doctor/content');
  revalidatePath('/app/patient');
  revalidatePath('/app/patient/sections', 'layout');
  return { ok: true };
}
