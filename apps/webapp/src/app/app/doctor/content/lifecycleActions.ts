'use server';

import { revalidatePath } from 'next/cache';
import { revalidatePatientContentPaths } from '@/app-layer/content/revalidatePatientContentPaths';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  entitlementMutationRefusalMessage,
  requireEntitlementForMutationAction,
} from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { contentMechanicForSection } from '@/app-layer/content/warmupsContentMutationGuard';

export type LifecycleState = { ok: boolean; error?: string };

export async function applyContentLifecycle(
  _prev: LifecycleState | null,
  formData: FormData,
): Promise<LifecycleState> {
  const workspace = await requireDoctorWorkspaceContext();
  const id = (formData.get('id') as string)?.trim();
  const op = (formData.get('op') as string)?.trim();
  if (!id || !op) return { ok: false, error: 'Некорректные данные' };

  const deps = buildAppDeps();
  const page = await deps.contentPages.getById(id);
  const section = page ? await deps.contentSections.getBySlug(page.section) : null;
  const mechanic = contentMechanicForSection(section);
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
  const now = new Date().toISOString();

  try {
    const patch =
      op === 'publish'
        ? { isPublished: true }
        : op === 'unpublish'
          ? { isPublished: false }
          : op === 'archive'
            ? { archivedAt: now }
            : op === 'unarchive'
              ? { archivedAt: null }
              : op === 'soft_delete'
                ? { deletedAt: now }
                : op === 'restore'
                  ? { deletedAt: null }
                  : null;
    if (!patch) return { ok: false, error: 'Неизвестное действие' };
    await withDoctorWorkspacePrincipal(workspace, 'doctor.content.page.lifecycle', () =>
      deps.contentPages.updateLifecycle(id, patch),
    );
  } catch (e) {
    console.error('applyContentLifecycle', e);
    return { ok: false, error: 'Не удалось применить действие' };
  }

  revalidatePath('/app/doctor/content');
  revalidatePath('/app/patient/content');
  if (page) {
    revalidatePatientContentPaths({
      slug: page.slug,
      section: page.section,
      revalidateSectionsLayout: true,
    });
  } else {
    revalidatePath('/app/patient/sections', 'layout');
  }
  return { ok: true };
}
