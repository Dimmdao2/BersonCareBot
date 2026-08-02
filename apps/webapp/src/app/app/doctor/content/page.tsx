import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logServerRuntimeError } from '@/infra/logging/serverRuntimeLog';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  getMechanicMutationAvailability,
  getMechanicSurfaceVisibility,
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
import { isWarmupsContentSection } from '@/app-layer/content/warmupsContentMutationGuard';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { notFound } from 'next/navigation';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import type { ContentPageListRow } from './ContentPagesSectionList';
import { ContentHubShell, type ContentHubSection } from './ContentHubShell';
import type { ContentRatingSummary } from './ContentRatingChip';
import type { PublishedCourseOption } from './ContentForm';

export default async function DoctorContentPage() {
  const workspace = await requireDoctorWorkspaceContext();
  const [cmsVisibility, warmupsVisibility, patientHomeTodayVisibility] = await Promise.all([
    getMechanicSurfaceVisibility(workspace, 'cms_pages'),
    getMechanicSurfaceVisibility(workspace, 'warmups'),
    getMechanicSurfaceVisibility(workspace, 'patient_home_today'),
  ]);
  if (
    !cmsVisibility.directUrl &&
    !warmupsVisibility.directUrl &&
    !patientHomeTodayVisibility.directUrl
  ) {
    notFound();
  }
  const session = workspace.session;
  const deps = buildAppDeps();
  const canManageCms = (await getMechanicMutationAvailability(workspace, 'cms_pages')).available;
  const canManageWarmups = (
    await getMechanicMutationAvailability(workspace, 'warmups')
  ).available;
  const coursesEnabled =
    cmsVisibility.directUrl && (await requireEntitlementForReadAction(workspace, 'courses')).ok;
  const patientHomeTodayEnabled = patientHomeTodayVisibility.directUrl;
  const warmupsEnabled = warmupsVisibility.directUrl;

  let pages: Awaited<ReturnType<typeof deps.contentPages.listAll>> = [];
  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  let ratingsById: Record<string, ContentRatingSummary> = {};
  let publishedCourses: PublishedCourseOption[] = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;

  try {
    ({ pages, sections, ratingsById, publishedCourses } = await withDoctorWorkspacePrincipal(
      workspace,
      'doctor.content.read',
      async () => {
        const scopedPages = await deps.contentPages.listAll();
        const [scopedSections, ratingMap, courses] = await Promise.all([
          deps.contentSections.listAll(),
          deps.materialRating.listDoctorAggregates({
            organizationId: workspace.organizationId,
            targetKind: 'content_page',
            targetIds: scopedPages.map((p) => p.id),
          }),
          coursesEnabled
            ? deps.courses.listCoursesForDoctor({ status: 'published', includeArchived: false })
            : Promise.resolve([]),
        ]);
        return {
          pages: scopedPages,
          sections: scopedSections,
          ratingsById: Object.fromEntries(
            [...ratingMap.entries()].map(([id, agg]) => [id, { avg: agg.avg, count: agg.count }]),
          ),
          publishedCourses: courses.map((c) => ({ id: c.id, title: c.title })),
        };
      },
    ));
  } catch (err) {
    loadError = logServerRuntimeError('app/doctor/content', err);
  }

  sections = sections.filter((section) =>
    isWarmupsContentSection(section) ? warmupsEnabled : cmsVisibility.directUrl,
  );
  const visibleSectionSlugs = new Set(sections.map((section) => section.slug));
  pages = pages.filter((page) => visibleSectionSlugs.has(page.section));

  const isDev = process.env.NODE_ENV === 'development';

  // Build hub sections (include help section, exclude it from article nav in ContentNav)
  const hubSections: ContentHubSection[] = sections.map((s) => ({
    slug: s.slug,
    title: s.title,
    isVisible: s.isVisible,
    kind: s.kind,
    systemParentCode: s.systemParentCode,
    sortOrder: s.sortOrder,
  }));

  // Map pages to ContentPageListRow, adding imageUrl for tile view (Step 2)
  const toListRow = (p: (typeof pages)[0]): ContentPageListRow => ({
    id: p.id,
    section: p.section,
    slug: p.slug,
    title: p.title,
    sortOrder: p.sortOrder,
    isPublished: p.isPublished,
    requiresAuth: p.requiresAuth,
    archivedAt: p.archivedAt,
    deletedAt: p.deletedAt,
    imageUrl: p.imageUrl,
  });

  // Group pages by section slug
  const pagesBySectionSlug: Record<string, ContentPageListRow[]> = {};
  for (const p of pages) {
    if (!pagesBySectionSlug[p.section]) {
      pagesBySectionSlug[p.section] = [];
    }
    pagesBySectionSlug[p.section].push(toListRow(p));
  }

  return (
    <DoctorAppShell title="Контент" user={session.user}>
      <ContentHubShell
        sections={hubSections}
        cmsEnabled={cmsVisibility.directUrl}
        canManageCms={canManageCms}
        canManageWarmups={canManageWarmups}
        patientHomeTodayEnabled={patientHomeTodayEnabled}
        warmupsEnabled={warmupsEnabled}
        fullSections={sections}
        pagesBySectionSlug={pagesBySectionSlug}
        ratingsById={ratingsById}
        publishedCourses={publishedCourses}
        loadError={
          loadError
            ? { digest: loadError.digest, name: loadError.name, message: loadError.message }
            : null
        }
        isDev={isDev}
      />
    </DoctorAppShell>
  );
}
