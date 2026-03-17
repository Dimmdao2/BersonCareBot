/**
 * Главное меню пациента («/app/patient»).
 * Показывается только авторизованному пользователю с ролью пациента. Список пунктов меню
 * (дневник симптомов, ЛФК, уроки, кабинет и т.д.) берётся из конфигурации по роли; каждый
 * пункт — карточка-ссылка с названием (одна колонка, без описания). Кнопка «Назад» не выводится (это корневая страница раздела).
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";

/** Строит главную страницу пациента: оболочка и сетка карточек разделов. */
export default async function PatientHomePage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const menu = deps.menu.getMenuForRole(session.user.role);

  return (
    <AppShell title="Главное меню" user={session.user} variant="patient">
      <section className="feature-grid">
        {menu.map((item) => (
          <FeatureCard
            key={item.id}
            title={item.title}
            href={item.href}
            status={item.status}
            compact
          />
        ))}
      </section>
    </AppShell>
  );
}
