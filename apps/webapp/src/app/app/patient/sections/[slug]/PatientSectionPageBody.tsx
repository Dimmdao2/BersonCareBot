import { reminderRuleToPatientJson } from "@/app/api/patient/reminders/reminderPatientJson";
import { cn } from "@/lib/utils";
import { FeatureCard } from "@/shared/ui/FeatureCard";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { PatientSectionSubscriptionCallout } from "../PatientSectionSubscriptionCallout";
import { SectionWarmupsReminderBar } from "../SectionWarmupsReminderBar";
import type { getSubscriptionCarouselSectionPresentation } from "@/modules/patient-home/patientHomeResolvers";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import type { ContentPageRow } from "@/infra/repos/pgContentPages";

type SubscriptionPresentation = ReturnType<typeof getSubscriptionCarouselSectionPresentation>;

type Props = {
  canonicalSlug: string;
  sectionTitle: string;
  subscriptionSectionPresentation: SubscriptionPresentation;
  pages: ContentPageRow[];
  courseHighlightByLinkedId: Map<string, string>;
  warmupsReminderJson: ReturnType<typeof reminderRuleToPatientJson> | null;
  warmupsPersonalBar: boolean;
};

/** Синхронная разметка списка материалов; данные загружает `page.tsx`. */
export function PatientSectionPageBody({
  canonicalSlug,
  sectionTitle,
  subscriptionSectionPresentation,
  pages,
  courseHighlightByLinkedId,
  warmupsReminderJson,
  warmupsPersonalBar,
}: Props) {
  return (
    <>
      {warmupsPersonalBar ? (
        <SectionWarmupsReminderBar
          sectionTitle={sectionTitle}
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
        <p className={cn(patientMutedTextClass, "mt-4")}>В этом разделе пока нет материалов.</p>
      ) : null}
    </>
  );
}
