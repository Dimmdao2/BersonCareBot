/**
 * Прохождение программы лечения (`/app/patient/treatment-programs/[instanceId]`).
 */
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientTreatmentProgramDetailClient } from "../PatientTreatmentProgramDetailClient";

type Props = { params: Promise<{ instanceId: string }> };

export default async function PatientTreatmentProgramDetailPage({ params }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell title="Программа" user={null} backHref={routePaths.patientTreatmentPrograms} backLabel="Программы" variant="patient">
        <p className="text-sm text-muted-foreground">Войдите для доступа.</p>
      </AppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPrograms);
  if (dataGate === "guest") {
    return (
      <AppShell title="Программа" user={session.user} backHref={routePaths.patientTreatmentPrograms} backLabel="Программы" variant="patient">
        <p className="text-sm text-muted-foreground">Раздел доступен после входа.</p>
      </AppShell>
    );
  }

  const { instanceId } = await params;
  const deps = buildAppDeps();
  let detail;
  try {
    detail = await deps.treatmentProgramInstance.getInstanceForPatient(session.user.userId, instanceId);
  } catch {
    notFound();
  }

  const initialTestResults = await deps.treatmentProgramProgress.listTestResultsForInstance(instanceId);

  return (
    <AppShell
      title={detail.title}
      user={session.user}
      backHref={routePaths.patientTreatmentPrograms}
      backLabel="Программы"
      variant="patient"
    >
      <PatientTreatmentProgramDetailClient initial={detail} initialTestResults={initialTestResults} />
    </AppShell>
  );
}
