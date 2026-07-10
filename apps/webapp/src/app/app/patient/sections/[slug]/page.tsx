/**
 * Список материалов раздела: «/app/patient/sections/[slug]».
 * Раздел «Разминки» — редирект на «Разминка дня» (как с главной / из напоминаний).
 */

import { notFound, permanentRedirect, redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { resolvePatientContentSectionSlug } from "@/infra/repos/resolvePatientContentSectionSlug";
import { getSubscriptionCarouselSectionPresentation } from "@/modules/patient-home/patientHomeResolvers";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import {
  canViewPatientAuthOnlySection,
  filterPatientSectionPages,
} from "@/app-layer/platform-access";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { PatientSectionPageBody } from "./PatientSectionPageBody";

type Props = { params: Promise<{ slug: string }> };

function isWarmupsPatientSection(
  canonicalSlug: string,
  systemParentCode: string | null | undefined,
): boolean {
  if (systemParentCode === "warmups") return true;
  const slug = canonicalSlug.trim();
  return slug === DEFAULT_WARMUPS_SECTION_SLUG;
}

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

  if (isWarmupsPatientSection(canonicalSlug, section.systemParentCode)) {
    redirect(routePaths.patientGoDailyWarmup);
  }

  const allSectionPages = await deps.contentPages.listBySection(canonicalSlug, { viewAuthOnlyPages: true });
  const canViewSection = await canViewPatientAuthOnlySection(
    session,
    section.requiresAuth,
    allSectionPages.map((p) => ({ slug: p.slug, requiresAuth: p.requiresAuth })),
    deps.entitlements,
  );
  if (!canViewSection) notFound();

  const homeBlocks = await deps.patientHomeBlocks.listBlocksWithItems();
  const subscriptionSectionPresentation = getSubscriptionCarouselSectionPresentation(homeBlocks, canonicalSlug);

  const pages = await filterPatientSectionPages(session, allSectionPages, deps.entitlements);

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
    <PatientAppShell
      title={section.title}
      user={session?.user ?? null}
      backHref={routePaths.patient}
      backLabel="Меню"
     
      patientTitleBadge={subscriptionSectionPresentation?.badgeLabel}
    >
      <PatientSectionPageBody
        canonicalSlug={canonicalSlug}
        subscriptionSectionPresentation={subscriptionSectionPresentation}
        pages={pages}
        courseHighlightByLinkedId={courseHighlightByLinkedId}
      />
    </PatientAppShell>
  );
}
