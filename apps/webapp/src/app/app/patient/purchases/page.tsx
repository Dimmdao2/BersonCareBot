/**
 * Страница «Мои покупки» (`/app/patient/purchases`).
 * Только для пациента: текст раздела из `getPurchaseSectionState()` и пустое состояние списка до платёжного модуля.
 * Кнопка «Назад» — в главное меню пациента.
 */

import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { PurchasesGuestAccess } from "@/shared/ui/patient/guestAccess";
import { cn } from "@/lib/utils";
import { patientSectionSurfaceClass } from "@/shared/ui/patientVisual";
import { PatientPurchasesClient } from "./PatientPurchasesClient";

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
  return (
    <AppShell title="Мои покупки" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      <section id="patient-purchases-items-section" className={cn(patientSectionSurfaceClass, "!gap-6")}>
        <PatientPurchasesClient />
      </section>
    </AppShell>
  );
}
