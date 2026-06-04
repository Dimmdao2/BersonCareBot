/**
 * Legacy URL `/app/patient/treatment/promo` — сразу открывает материализованную программу (без виртуального списка).
 */
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { patientMutedTextClass } from "@/shared/ui/patient/patientVisual";
import { resolvePlanStartLessonPathForPatient } from "@/app/app/patient/go/resolvePatientReminderGoTargets";

export default async function PatientTreatmentPromoDefaultPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <PatientAppShell title="Программа" user={null} backHref={routePaths.patient} backLabel="Меню">
        <p className={patientMutedTextClass}>Войдите, чтобы продолжить.</p>
      </PatientAppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPromoDefault);
  if (dataGate === "guest") {
    return (
      <PatientAppShell title="Программа" user={session.user} backHref={routePaths.patient} backLabel="Меню">
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </PatientAppShell>
    );
  }

  const deps = buildAppDeps();
  redirect(await resolvePlanStartLessonPathForPatient(deps, session.user.userId));
}
