/**
 * Список назначенных программ лечения (`/app/patient/treatment`).
 * Старый путь `/app/patient/treatment-programs` → редирект в `next.config.ts`.
 */
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import {
  PatientTreatmentProgramsListClient,
} from "./PatientTreatmentProgramsListClient";

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
  const list = await deps.treatmentProgramInstance.listForPatient(session.user.userId);

  const activeCandidates = list
    .filter((p) => p.status === "active")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
  const activeSummary = activeCandidates[0] ?? null;

  // Если есть активная программа — сразу открывать её без лишнего шага.
  if (activeSummary) {
    redirect(routePaths.patientTreatmentProgram(activeSummary.id));
  }

  const archived = list
    .filter((p) => p.status === "completed")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));

  const promoTplId = await deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId();
  if (promoTplId) {
    try {
      const tpl = await deps.treatmentProgram.getTemplate(promoTplId);
      if (tpl.status === "published") {
        const ensured = await deps.treatmentProgramInstance.ensureDefaultPromoProgramForPatient({
          patientUserId: session.user.userId,
        });
        redirect(routePaths.patientTreatmentProgram(ensured.id));
      }
    } catch {
      /* нет промо-инстанса — показываем список с CTA персональной программы */
    }
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
        archived={archived}
        messagesHref={routePaths.patientMessages}
      />
    </AppShell>
  );
}
