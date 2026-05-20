/**
 * Legacy URL `/app/patient/treatment/promo` — сразу открывает материализованную программу (без виртуального списка).
 */
import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { resolvePlanStartLessonPathForPatient } from "@/app/app/patient/go/resolvePatientReminderGoTargets";

export default async function PatientTreatmentPromoDefaultPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell title="Программа" user={null} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className={patientMutedTextClass}>Войдите, чтобы продолжить.</p>
      </AppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPromoDefault);
  if (dataGate === "guest") {
    return (
      <AppShell title="Программа" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </AppShell>
    );
  }

  const deps = buildAppDeps();
  redirect(await resolvePlanStartLessonPathForPatient(deps, session.user.userId));
}
