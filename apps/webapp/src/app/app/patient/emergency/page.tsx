/**
 * Страница «Скорая помощь» («/app/patient/emergency»).
 * Только для пациента. Список тем (например, помощь при боли) — кнопки-карточки с заголовком,
 * без описания и «Подробнее». Кнопка «Назад» — в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";

/** Строит страницу списка тем «Скорая помощь»: оболочка и сетка карточек-ссылок. Доступно без входа. */
export default async function EmergencyPage() {
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();
  const topics = await deps.emergency.listEmergencyTopics();

  return (
    <AppShell title="Скорая помощь" user={session?.user ?? null} backHref="/app/patient" backLabel="Меню" variant="patient">
      <section id="patient-emergency-feature-grid-section" className="grid gap-4 md:grid-cols-2">
        {topics.map((topic) => (
          <FeatureCard
            key={topic.id}
            containerId={`patient-emergency-card-${topic.id}`}
            title={topic.title}
            href={`/app/patient/content/${topic.id}`}
            compact
          />
        ))}
      </section>
    </AppShell>
  );
}
