/**
 * Страница «Мои покупки» (`/app/patient/purchases`).
 * Только для пациента: текст раздела из `getPurchaseSectionState()` и пустое состояние списка до платёжного модуля.
 * Кнопка «Назад» — в главное меню пациента.
 */

import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { PurchasesGuestAccess } from "@/shared/ui/patient/guestAccess";
import { cn } from "@/lib/utils";
import { patientSectionSurfaceClass } from "@/shared/ui/patient/patientVisual";
import { PatientPurchasesClient } from "./PatientPurchasesClient";
import { PatientBookingHistorySection } from "../profile/PatientBookingHistorySection";

/** Рендерит страницу покупок: hero с описанием и блок «Курсы, доступы и подписки» с empty-state. */
export default async function PurchasesPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <PatientAppShell title="Мои покупки" user={null} backHref="/app/patient" backLabel="Меню">
        <PurchasesGuestAccess session={null} />
      </PatientAppShell>
    );
  }
  const dataGate = await patientRscPersonalDataGate(session, routePaths.purchases);
  if (dataGate === "guest") {
    return (
      <PatientAppShell title="Мои покупки" user={session.user} backHref="/app/patient" backLabel="Меню">
        <PurchasesGuestAccess session={session} rscGuestTier />
      </PatientAppShell>
    );
  }
  return (
    <PatientAppShell title="Мои покупки" user={session.user} backHref="/app/patient" backLabel="Меню">
      <section id="patient-purchases-items-section" className={cn(patientSectionSurfaceClass, "!gap-6")}>
        <PatientPurchasesClient />
      </section>
      <PatientBookingHistorySection mode="payments" />
    </PatientAppShell>
  );
}
