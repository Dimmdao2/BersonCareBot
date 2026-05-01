/**
 * Страница «Мои покупки» (`/app/patient/purchases`).
 * Только для пациента: текст раздела из `getPurchaseSectionState()` и пустое состояние списка до платёжного модуля.
 * Кнопка «Назад» — в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { PurchasesGuestAccess } from "@/shared/ui/patient/guestAccess";
import { cn } from "@/lib/utils";
import { patientMutedTextClass, patientSectionSurfaceClass } from "@/shared/ui/patientVisual";

/** Рендерит страницу покупок: hero с описанием и блок «Курсы, доступы и подписки» с empty-state. */
export default async function PurchasesPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell title="Мои покупки" user={null} backHref="/app/patient" backLabel="Меню" variant="patient">
        <PurchasesGuestAccess session={null} />
      </AppShell>
    );
  }
  const dataGate = await patientRscPersonalDataGate(session, routePaths.purchases);
  if (dataGate === "guest") {
    return (
      <AppShell title="Мои покупки" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
        <PurchasesGuestAccess session={session} rscGuestTier />
      </AppShell>
    );
  }
  const deps = buildAppDeps();
  const state = deps.purchases.getPurchaseSectionState();

  return (
    <AppShell title="Мои покупки" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      <section id="patient-purchases-hero-section" className={cn(patientSectionSurfaceClass, "!gap-4 !p-6")}>
        <p>{state.description}</p>
      </section>
      <section id="patient-purchases-items-section" className={patientSectionSurfaceClass}>
        <h2>Курсы, доступы и подписки</h2>
        <p className={patientMutedTextClass}>
          Сейчас у вас нет активных покупок. Раздел станет доступен после запуска платежного функционала.
        </p>
      </section>
    </AppShell>
  );
}
