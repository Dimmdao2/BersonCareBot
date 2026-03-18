/**
 * Главное меню пациента («/app/patient»).
 * Доступно без входа (гость): можно смотреть общие бесплатные материалы. Список пунктов меню
 * берётся из конфигурации; при клике на «Мои записи», дневники и т.д. — запрос входа и при необходимости телефона.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";

/** Строит главную страницу пациента: оболочка и сетка карточек разделов. Гость видит то же меню без входа. */
export default async function PatientHomePage() {
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();
  const menu = deps.menu.getMenuForRole("client");

  return (
    <AppShell title="Главное меню" user={session?.user ?? null} variant="patient">
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
