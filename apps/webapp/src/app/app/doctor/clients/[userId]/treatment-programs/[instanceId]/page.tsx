/**
 * Экземпляр программы лечения пациента (врач): просмотр и override комментариев.
 */
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { TreatmentProgramInstanceDetailClient } from "./TreatmentProgramInstanceDetailClient";

type Props = {
  params: Promise<{ userId: string; instanceId: string }>;
  searchParams: Promise<{ scope?: string }>;
};

export default async function DoctorPatientTreatmentProgramPage({ params, searchParams }: Props) {
  const session = await requireDoctorAccess();
  const { userId, instanceId } = await params;
  const { scope: scopeParam } = await searchParams;

  const deps = buildAppDeps();
  let detail;
  try {
    detail = await deps.treatmentProgramInstance.getInstanceForPatient(userId, instanceId);
  } catch {
    notFound();
  }

  const [testResults, programEvents, programActionLog, appDisplayTimeZone, clientProfile] =
    await Promise.all([
      deps.treatmentProgramProgress.listTestResultsForInstance(instanceId),
      deps.treatmentProgramInstance.listProgramEvents(instanceId),
      deps.treatmentProgramProgress.listProgramActionLogForInstance(instanceId),
      getAppDisplayTimeZone(),
      deps.doctorClients.getClientProfile(userId),
    ]);

  const patientDisplayNameRaw = clientProfile?.identity.displayName?.trim() ?? "";
  const patientDisplayName = patientDisplayNameRaw !== "" ? patientDisplayNameRaw : "Имя не указано";

  const qs = scopeParam ? `?scope=${encodeURIComponent(scopeParam)}` : "";
  const backHref = `/app/doctor/clients/${encodeURIComponent(userId)}${qs}`;

  return (
    <AppShell
      title={detail.title}
      user={session.user}
      backHref={backHref}
      backLabel="Карточка клиента"
      variant="doctor"
    >
      <TreatmentProgramInstanceDetailClient
        patientDisplayName={patientDisplayName}
        initial={detail}
        initialTestResults={testResults}
        initialEvents={programEvents}
        initialActionLog={programActionLog}
        currentUserId={session.user.userId}
        isAdmin={session.user.role === "admin"}
        appDisplayTimeZone={appDisplayTimeZone}
      />
    </AppShell>
  );
}
