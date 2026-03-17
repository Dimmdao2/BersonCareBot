/**
 * Страница «Скорая помощь» («/app/patient/emergency»).
 * Только для пациента. Список тем (например, помощь при боли): заголовок, краткое описание и
 * ссылка «Подробнее» на страницу контента по идентификатору. Кнопка «Назад» — в главное меню пациента.
 */

import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

/** Строит страницу списка тем «Скорая помощь»: оболочка и список карточек со ссылками на контент. */
export default async function EmergencyPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const topics = deps.emergency.listEmergencyTopics();

  return (
    <AppShell title="Скорая помощь" user={session.user} backHref="/app/patient" backLabel="Меню">
      <ul className="list">
        {topics.map((topic) => (
          <li key={topic.id} className="list-item">
            <strong>{topic.title}</strong>
            <p>{topic.summary}</p>
            <Link href={`/app/patient/content/${topic.id}`} className="button button--ghost">
              Подробнее
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
