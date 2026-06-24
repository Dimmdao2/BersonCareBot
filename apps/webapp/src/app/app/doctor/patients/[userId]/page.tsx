/**
 * /app/doctor/patients/[userId] — карточка пациента.
 * Pattern: requireDoctorAccess → buildAppDeps → pass promise to PatientCardClient.
 */
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { doctorPageStackClass } from "@/shared/ui/doctor/doctorVisual";
import { routePaths } from "@/app-layer/routes/paths";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { loadDoctorPatientProgramActivity } from "../loadDoctorPatientProgramActivity";
import { PatientCardClient } from "./PatientCardClient";

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorPatientCardPage({ params, searchParams }: PageProps) {
  const { userId } = await params;
  const sp = await searchParams;

  if (!z.string().uuid().safeParse(userId).success) {
    notFound();
  }

  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  const displayIana = await getAppDisplayTimeZone();

  const [
    cardHeaderPromise,
    physicalRow,
    clinicalState,
    visits,
    notes,
    tasks,
    signals,
    programActivity,
    appointments,
    programInstances,
    patientFileRecords,
  ] = await Promise.all([
    deps.doctorClients.getPatientCardHeader(userId),
    runWebappPgText<{ height_cm: number | null; weight_kg: number | null }>(
      `SELECT height_cm, weight_kg FROM platform_users WHERE id = $1::uuid AND role = 'client'`,
      [userId],
    ),
    deps.patientClinical.getClinicalState(userId),
    deps.patientClinical.listVisits(userId),
    deps.doctorNotes.listForUser(userId),
    deps.specialistTasks.listPatientTasks(session.user.userId, userId, false),
    deps.doctorProactiveInsights.listForPatient({ patientUserId: userId, displayIana }),
    loadDoctorPatientProgramActivity(
      { programItemDiscussion: deps.programItemDiscussion },
      { patientUserId: userId, viewerUserId: session.user.userId },
    ),
    deps.doctorClientsPort.listPatientAppointments(userId),
    deps.treatmentProgramInstance.listForPatientClinicalView(userId),
    deps.patientFiles.listFiles(userId),
  ]);

  // Map file records to UI shape (previewUrl omitted — S3 presigning deferred to client).
  const initialFiles = patientFileRecords.map((f) => ({ ...f, previewUrl: null }));

  const physicalData = physicalRow.rows[0]
    ? { heightCm: physicalRow.rows[0].height_cm, weightKg: physicalRow.rows[0].weight_kg }
    : { heightCm: null, weightKg: null };

  const initialTab = typeof sp.tab === "string" ? sp.tab : undefined;
  const createVisitFrom = typeof sp.createVisitFrom === "string" ? sp.createVisitFrom : undefined;
  const visitDate = typeof sp.visitDate === "string" ? sp.visitDate : undefined;

  return (
    <DoctorAppShell title="Карточка пациента" user={session.user} backHref={routePaths.doctorPatients}>
      <section className={doctorPageStackClass}>
        <PatientCardClient
          cardHeader={cardHeaderPromise}
          initialTab={initialTab}
          createVisitFrom={createVisitFrom}
          visitDate={visitDate}
          initialPhysicalData={physicalData}
          initialClinicalState={clinicalState}
          initialVisits={visits}
          initialNotes={notes}
          initialTasks={tasks}
          initialSignals={signals}
          initialProgramActivity={programActivity}
          initialAppointments={appointments}
          initialProgramInstances={programInstances}
          initialFiles={initialFiles}
        />
      </section>
    </DoctorAppShell>
  );
}
