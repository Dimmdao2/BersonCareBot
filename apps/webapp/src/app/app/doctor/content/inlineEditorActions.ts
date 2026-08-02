'use server';

import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  getMechanicSurfaceVisibility,
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
import { contentMechanicForSection } from '@/app-layer/content/warmupsContentMutationGuard';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';

/**
 * Load a single content page's full editable record for the inline master-detail editor.
 * Returns the same shape that ContentForm's `page` prop expects, or null if not found.
 */
export async function loadContentPageForInlineEdit(id: string): Promise<{
  id: string;
  section: string;
  slug: string;
  title: string;
  summary: string;
  bodyMd: string;
  bodyHtml: string;
  sortOrder: number;
  isPublished: boolean;
  requiresAuth: boolean;
  videoUrl: string | null;
  imageUrl: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  linkedCourseId: string | null;
} | null> {
  const workspace = await requireDoctorWorkspaceContext();
  const [cmsVisibility, warmupsVisibility] = await Promise.all([
    getMechanicSurfaceVisibility(workspace, 'cms_pages'),
    getMechanicSurfaceVisibility(workspace, 'warmups'),
  ]);
  if (!cmsVisibility.directUrl && !warmupsVisibility.directUrl) return null;
  const deps = buildAppDeps();
  const page = await withDoctorWorkspacePrincipal(
    workspace,
    'doctor.content.inline-editor.read',
    () => deps.contentPages.getById(id),
  );
  if (!page) return null;
  const section = await withDoctorWorkspacePrincipal(
    workspace,
    'doctor.content.inline-editor.section-read',
    () => deps.contentSections.getBySlug(page.section),
  );
  const entitlement = await requireEntitlementForReadAction(
    workspace,
    contentMechanicForSection(section),
  );
  if (!entitlement.ok) return null;
  return {
    id: page.id,
    section: page.section,
    slug: page.slug,
    title: page.title,
    summary: page.summary,
    bodyMd: page.bodyMd,
    bodyHtml: page.bodyHtml,
    sortOrder: page.sortOrder,
    isPublished: page.isPublished,
    requiresAuth: page.requiresAuth,
    videoUrl: page.videoUrl,
    imageUrl: page.imageUrl,
    archivedAt: page.archivedAt,
    deletedAt: page.deletedAt,
    linkedCourseId: page.linkedCourseId,
  };
}
