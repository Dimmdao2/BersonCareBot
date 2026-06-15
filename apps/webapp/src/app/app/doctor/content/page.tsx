import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { PageSection } from "@/components/common/layout/PageSection";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import type { ContentPageListRow } from "./ContentPagesSectionList";
import { ContentHubShell, type ContentHubSection } from "./ContentHubShell";
import type { ContentRatingSummary } from "./ContentRatingChip";

export default async function DoctorContentPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  let pages: Awaited<ReturnType<typeof deps.contentPages.listAll>> = [];
  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  let ratingsById: Record<string, ContentRatingSummary> = {};
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;

  try {
    pages = await deps.contentPages.listAll();
    sections = await deps.contentSections.listAll();
    // Batch-load ★ ratings for the material cards/rows (one grouped query, no N+1).
    const ratingMap = await deps.materialRating.listDoctorAggregates({
      targetKind: "content_page",
      targetIds: pages.map((p) => p.id),
    });
    ratingsById = Object.fromEntries(
      [...ratingMap.entries()].map(([id, agg]) => [id, { avg: agg.avg, count: agg.count }]),
    );
  } catch (err) {
    loadError = logServerRuntimeError("app/doctor/content", err);
  }

  const isDev = process.env.NODE_ENV === "development";

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
      <PageSection id="doctor-content-section" as="section" className="flex flex-col gap-4">
        <ContentHubShell
          sections={hubSections}
          pagesBySectionSlug={pagesBySectionSlug}
          ratingsById={ratingsById}
          loadError={
            loadError
              ? { digest: loadError.digest, name: loadError.name, message: loadError.message }
              : null
          }
          isDev={isDev}
        />
      </PageSection>
    </DoctorAppShell>
  );
}
