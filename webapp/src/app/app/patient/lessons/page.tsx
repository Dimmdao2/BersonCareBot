/**
 * Страница «Полезные уроки» («/app/patient/lessons»).
 * Только для пациента. Список уроков из каталога — кнопки-карточки с заголовком,
 * без описания и «Открыть». Кнопка «Назад» — в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";

/** Строит страницу списка уроков: оболочка и сетка карточек-ссылок. */
export default async function PatientLessonsPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const lessons = deps.lessons.listLessons();

  return (
    <AppShell title="Полезные уроки" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      <section className="feature-grid">
        {lessons.map((lesson) => (
          <FeatureCard
            key={lesson.id}
            title={lesson.title}
            href={`/app/patient/content/${lesson.id}`}
            status={lesson.status}
            compact
          />
        ))}
      </section>
    </AppShell>
  );
}
