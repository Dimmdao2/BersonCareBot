/**
 * Страница «Мои покупки» («/app/patient/purchases»).
 * Только для пациента. Описание раздела и список курсов/доступов/подписок (пока на мок-данных).
 * Кнопка «Назад» — в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess, requirePatientPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";

/** Мок-данные для раздела покупок (курсы, доступы, подписки). */
const MOCK_ITEMS = [
  { id: "1", title: "Курс «Здоровая спина»", type: "Курс", status: "Доступен", expiresAt: "до 15.06.2025" },
  { id: "2", title: "Доступ к урокам ЛФК", type: "Доступ", status: "Активен", expiresAt: "бессрочно" },
  { id: "3", title: "Подписка «Персональный помощник»", type: "Подписка", status: "Скоро", expiresAt: "—" },
];

/** Строит страницу покупок: описание и список карточек с типом, статусом и сроком действия. */
export default async function PurchasesPage() {
  const session = await requirePatientAccess(routePaths.purchases);
  requirePatientPhone(session, routePaths.purchases);
  const deps = buildAppDeps();
  const state = deps.purchases.getPurchaseSectionState();

  return (
    <AppShell title="Мои покупки" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      <section className="hero-card stack">
        <p>{state.description}</p>
      </section>
      <section className="panel stack">
        <h2>Курсы, доступы и подписки</h2>
        <ul className="list">
          {MOCK_ITEMS.map((item) => (
            <li key={item.id} className="list-item">
              <strong>{item.title}</strong>
              <span className="status-pill status-pill--available">{item.type}</span>
              <span style={{ fontSize: "0.9rem", color: "#5f6f86" }}>{item.status} · {item.expiresAt}</span>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
