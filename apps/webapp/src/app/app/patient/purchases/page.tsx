/**
 * Страница «Мои покупки» («/app/patient/purchases»).
 * Только для пациента. Описание раздела и список курсов/доступов/подписок (пока на мок-данных).
 * Кнопка «Назад» — в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/shared/ui/AppShell";
import { patientHasPhoneOrMessenger, PurchasesGuestAccess } from "@/shared/ui/patient/guestAccess";

/** Мок-данные для раздела покупок (курсы, доступы, подписки). */
const MOCK_ITEMS = [
  { id: "1", title: "Курс «Здоровая спина»", type: "Курс", status: "Доступен", expiresAt: "до 15.06.2025" },
  { id: "2", title: "Доступ к урокам ЛФК", type: "Доступ", status: "Активен", expiresAt: "бессрочно" },
  { id: "3", title: "Подписка «Персональный помощник»", type: "Подписка", status: "Скоро", expiresAt: "—" },
];

/** Строит страницу покупок: описание и список карточек с типом, статусом и сроком действия. */
export default async function PurchasesPage() {
  const session = await getOptionalPatientSession();
  if (!session || !patientHasPhoneOrMessenger(session)) {
    return (
      <AppShell title="Мои покупки" user={session?.user ?? null} backHref="/app/patient" backLabel="Меню" variant="patient">
        <PurchasesGuestAccess session={session} />
      </AppShell>
    );
  }
  const deps = buildAppDeps();
  const state = deps.purchases.getPurchaseSectionState();

  return (
    <AppShell title="Мои покупки" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      <section id="patient-purchases-hero-section" className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col gap-4">
        <p>{state.description}</p>
      </section>
      <section id="patient-purchases-items-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2>Курсы, доступы и подписки</h2>
        <ul id="patient-purchases-items-list" className="m-0 list-none space-y-3 p-0">
          {MOCK_ITEMS.map((item) => (
            <li key={item.id} id={`patient-purchases-item-${item.id}`} className="rounded-lg border border-border bg-card p-3">
              <strong>{item.title}</strong>
              <Badge variant="secondary" className="font-normal">
                {item.type}
              </Badge>
              <span className="text-sm text-muted-foreground">{item.status} · {item.expiresAt}</span>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
