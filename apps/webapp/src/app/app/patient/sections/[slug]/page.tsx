/**
 * Список материалов раздела: «/app/patient/sections/[slug]».
 * Раздел и карточки загружаются из БД (content_sections + content_pages).
 */

import { notFound, permanentRedirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { resolvePatientContentSectionSlug } from "@/infra/repos/resolvePatientContentSectionSlug";
import { getSubscriptionCarouselSectionPresentation } from "@/modules/patient-home/patientHomeResolvers";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientSectionPageBody } from "./PatientSectionPageBody";

type Props = { params: Promise<{ slug: string }> };

export default async function PatientSectionPage({ params }: Props) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();

  const result = await resolvePatientContentSectionSlug(
    {
      getBySlug: (s) => deps.contentSections.getBySlug(s),
      getRedirectNewSlugForOldSlug: (s) => deps.contentSections.getRedirectNewSlugForOldSlug(s),
    },
    slug,
  );
  if (!result) notFound();
  if (result.canonicalSlug !== slug) {
    permanentRedirect(`/app/patient/sections/${encodeURIComponent(result.canonicalSlug)}`);
  }
  const section = result.section;
  const canonicalSlug = result.canonicalSlug;

  const canViewAuth = await resolvePatientCanViewAuthOnlyContent(session);
  if (section.requiresAuth && !canViewAuth) notFound();

  const homeBlocks = await deps.patientHomeBlocks.listBlocksWithItems();
  const subscriptionSectionPresentation = getSubscriptionCarouselSectionPresentation(homeBlocks, canonicalSlug);

  const pages = await deps.contentPages.listBySection(canonicalSlug, { viewAuthOnlyPages: canViewAuth });

  const linkedCourseIds = [
    ...new Set(
      pages
        .map((p) => p.linkedCourseId)
        .filter((id): id is string => typeof id === "string" && Boolean(id?.trim())),
    ),
  ].map((id) => id.trim());

  const courseHighlightByLinkedId = new Map<string, string>();
  if (linkedCourseIds.length > 0) {
    const courseRows = await Promise.all(linkedCourseIds.map((id) => deps.courses.getCourseForDoctor(id)));
    for (let i = 0; i < linkedCourseIds.length; i += 1) {
      const row = courseRows[i];
      const key = linkedCourseIds[i]!;
      if (row?.status === "published") {
        courseHighlightByLinkedId.set(key, `/app/patient/courses?highlight=${encodeURIComponent(row.id)}`);
      }
    }
  }

  return (
    <AppShell
      title={section.title}
      user={session?.user ?? null}
      backHref="/app/patient"
      backLabel="Меню"
      variant="patient"
      patientTitleBadge={subscriptionSectionPresentation?.badgeLabel}
    >
      <PatientSectionPageBody
        canonicalSlug={canonicalSlug}
        subscriptionSectionPresentation={subscriptionSectionPresentation}
        pages={pages}
        courseHighlightByLinkedId={courseHighlightByLinkedId}
      />
    </AppShell>
  );
}
