/**
 * Список назначенных программ лечения (`/app/patient/treatment`).
 * Старый путь `/app/patient/treatment-programs` → редирект в `next.config.ts`.
 */
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { resolvePatientTreatmentProgramEntry } from "@/modules/treatment-program/patientTreatmentProgramEntry";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { PatientTreatmentProgramsListClient } from "./PatientTreatmentProgramsListClient";

export const dynamic = "force-dynamic";

export default async function PatientTreatmentProgramsPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell title="Программы лечения" user={null} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className={patientMutedTextClass}>Войдите, чтобы увидеть назначенные программы.</p>
      </AppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPrograms);
  if (dataGate === "guest") {
    return (
      <AppShell title="Программы лечения" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </AppShell>
    );
  }

  const deps = buildAppDeps();
  const entry = await resolvePatientTreatmentProgramEntry(deps, session.user.userId);

  if (entry.kind === "redirect") {
    redirect(routePaths.patientTreatmentProgram(entry.instanceId));
  }

  return (
    <AppShell
      title="Программы лечения"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
      patientSuppressShellTitle
    >
      <PatientTreatmentProgramsListClient
        hero={null}
        archived={entry.archived}
        messagesHref={routePaths.patientMessages}
        promoEnsureFailed={entry.promoEnsureFailed}
      />
    </AppShell>
  );
}
