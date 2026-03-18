/**
 * Страница «Полезные уроки» («/app/patient/lessons»).
 * Только для пациента. Список уроков из каталога — кнопки-карточки с заголовком,
 * без описания и «Открыть». Кнопка «Назад» — в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";

/** Строит страницу списка уроков: оболочка и сетка карточек-ссылок. Доступно без входа. */
export default async function PatientLessonsPage() {
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();
  const lessons = deps.lessons.listLessons();

  return (
    <AppShell title="Полезные уроки" user={session?.user ?? null} backHref="/app/patient" backLabel="Меню" variant="patient">
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
