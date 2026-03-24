import { FeatureCard } from "@/shared/ui/FeatureCard";
import type { MenuItem } from "@/modules/menu/service";
import type { LessonCard } from "@/modules/lessons/service";

type Props = {
  emergency: MenuItem | undefined;
  lessons: LessonCard[];
};

/** Уроки: скорая помощь + до трёх карточек из каталога уроков. */
export function PatientHomeLessonsSection({ emergency, lessons }: Props) {
  const topLessons = lessons.slice(0, 3);
  if (!emergency && topLessons.length === 0) return null;
  return (
    <section id="patient-home-lessons-section" className="stack gap-3">
      <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">Уроки</h2>
      <div className="feature-grid">
        {emergency ? (
          <FeatureCard
            key={emergency.id}
            containerId={`patient-home-feature-card-${emergency.id}`}
            title={emergency.title}
            href={emergency.href}
            status={emergency.status}
            compact
          />
        ) : null}
        {topLessons.map((lesson) => (
          <FeatureCard
            key={lesson.id}
            containerId={`patient-home-lesson-card-${lesson.id}`}
            title={lesson.title}
            href={`/app/patient/content/${lesson.id}`}
            status={lesson.status}
            compact
          />
        ))}
      </div>
    </section>
  );
}
