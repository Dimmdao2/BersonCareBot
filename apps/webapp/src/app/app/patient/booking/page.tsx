/**
 * Запись на приём: виджет Rubitime на всю доступную высоту (EXEC I.9).
 * Доступна без привязки телефона (гость с сессией или без — см. getOptionalPatientSession).
 */
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";

const WIDGET_URL = "https://dmitryberson.rubitime.ru/widget";

export default async function PatientBookingPage() {
  const session = await getOptionalPatientSession();

  return (
    <AppShell
      title="Запись на приём"
      user={session?.user ?? null}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
      hidePatientQuickAddFAB
      patientEmbedMain
    >
      <div className="patient-iframe-bleed flex min-h-0 flex-1 flex-col">
        <iframe
          title="Rubitime — запись на приём"
          src={WIDGET_URL}
          className="min-h-0 w-full flex-1 border-0 bg-background"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </AppShell>
  );
}
