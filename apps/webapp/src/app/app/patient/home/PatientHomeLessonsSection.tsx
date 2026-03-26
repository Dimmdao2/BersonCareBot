import { FeatureCard } from "@/shared/ui/FeatureCard";
import type { MenuItem } from "@/modules/menu/service";
import type { LessonCard } from "@/modules/lessons/service";

type Props = {
  emergency: MenuItem | undefined;
  lessons: LessonCard[];
};

const RAW_PLAN_LESSON_CATEGORIES = [
  { id: "warmups", title: "Разминки", href: "/app/patient/lessons?category=warmups" },
  { id: "workouts", title: "Тренировки", href: "/app/patient/lessons?category=workouts" },
  { id: "materials", title: "Полезные материалы", href: "/app/patient/lessons?category=materials" },
] as const;

/** Уроки по RAW_PLAN: Скорая помощь + Разминки/Тренировки/Полезные материалы. */
export function PatientHomeLessonsSection({ emergency, lessons }: Props) {
  if (!emergency && lessons.length === 0) return null;
  return (
    <section id="patient-home-lessons-section" className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">Уроки</h2>
      <div className="grid gap-4 md:grid-cols-2">
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
        {RAW_PLAN_LESSON_CATEGORIES.map((lesson) => (
          <FeatureCard
            key={lesson.id}
            containerId={`patient-home-lesson-card-${lesson.id}`}
            title={lesson.title}
            href={lesson.href}
            status="available"
            compact
          />
        ))}
      </div>
    </section>
  );
}
