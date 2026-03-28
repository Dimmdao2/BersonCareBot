import { FeatureCard } from "@/shared/ui/FeatureCard";
import type { ContentSectionRow } from "@/infra/repos/pgContentSections";

type Props = {
  sections: ContentSectionRow[];
};

/** Блок «Уроки» на главной: карточки разделов из БД. */
export function PatientHomeLessonsSection({ sections }: Props) {
  if (sections.length === 0) return null;
  return (
    <section id="patient-home-lessons-section" className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">Уроки</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((s) => (
          <FeatureCard
            key={s.id}
            containerId={`patient-home-section-card-${s.slug}`}
            title={s.title}
            href={`/app/patient/sections/${encodeURIComponent(s.slug)}`}
            status="available"
            compact
          />
        ))}
      </div>
    </section>
  );
}
