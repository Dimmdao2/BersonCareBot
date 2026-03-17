/**
 * Страница «Скорая помощь» («/app/patient/emergency»).
 * Только для пациента. Список тем (например, помощь при боли) — кнопки-карточки с заголовком,
 * без описания и «Подробнее». Кнопка «Назад» — в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";

/** Строит страницу списка тем «Скорая помощь»: оболочка и сетка карточек-ссылок. */
export default async function EmergencyPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const topics = deps.emergency.listEmergencyTopics();

  return (
    <AppShell title="Скорая помощь" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      <section className="feature-grid">
        {topics.map((topic) => (
          <FeatureCard
            key={topic.id}
            title={topic.title}
            href={`/app/patient/content/${topic.id}`}
            compact
          />
        ))}
      </section>
    </AppShell>
  );
}
