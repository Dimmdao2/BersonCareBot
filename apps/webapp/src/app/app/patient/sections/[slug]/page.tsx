/**
 * Список материалов раздела: «/app/patient/sections/[slug]».
 * Раздел и карточки загружаются из БД (content_sections + content_pages).
 */

import { notFound, permanentRedirect } from "next/navigation";
import { reminderRuleToPatientJson } from "@/app/api/patient/reminders/reminderPatientJson";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { resolvePatientContentSectionSlug } from "@/infra/repos/resolvePatientContentSectionSlug";
import { getSubscriptionCarouselSectionPresentation } from "@/modules/patient-home/patientHomeResolvers";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";
import { PatientSectionSubscriptionCallout } from "../PatientSectionSubscriptionCallout";
import { SectionWarmupsReminderBar } from "../SectionWarmupsReminderBar";

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

  const [pages, homeBlocks] = await Promise.all([
    deps.contentPages.listBySection(canonicalSlug, { viewAuthOnlyPages: canViewAuth }),
    deps.patientHomeBlocks.listBlocksWithItems(),
  ]);
  const subscriptionSectionPresentation = getSubscriptionCarouselSectionPresentation(homeBlocks, canonicalSlug);

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
  let warmupsReminderJson: ReturnType<typeof reminderRuleToPatientJson> | null = null;
  let warmupsPersonalBar = false;
  if (canonicalSlug === DEFAULT_WARMUPS_SECTION_SLUG && session) {
    const dataGate = await patientRscPersonalDataGate(
      session,
      `/app/patient/sections/${encodeURIComponent(canonicalSlug)}`,
    );
    if (dataGate === "allow") {
      warmupsPersonalBar = true;
      const rules = await deps.reminders.listRulesByUser(session.user.userId);
      const matches = rules.filter(
        (r) => r.linkedObjectType === "content_section" && r.linkedObjectId === DEFAULT_WARMUPS_SECTION_SLUG,
      );
      matches.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      const latest = matches[0];
      if (latest) warmupsReminderJson = reminderRuleToPatientJson(latest);
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
      {warmupsPersonalBar ? (
        <SectionWarmupsReminderBar
          sectionTitle={section.title}
          existingRule={warmupsReminderJson}
          linkedObjectId={DEFAULT_WARMUPS_SECTION_SLUG}
        />
      ) : null}
      {subscriptionSectionPresentation ? <PatientSectionSubscriptionCallout /> : null}
      <section id={`patient-section-${canonicalSlug}-grid`} className="grid gap-4 md:grid-cols-2">
        {pages.map((p) => (
          <FeatureCard
            key={p.id}
            containerId={`patient-section-${canonicalSlug}-card-${p.slug}`}
            title={p.title}
            href={`/app/patient/content/${p.slug}`}
            compact
            secondaryHref={
              p.linkedCourseId?.trim() ? courseHighlightByLinkedId.get(p.linkedCourseId.trim()) : undefined
            }
          />
        ))}
      </section>
      {pages.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">В этом разделе пока нет материалов.</p>
      ) : null}
    </AppShell>
  );
}
