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

  const cardHeaderPromise = deps.doctorClients.getPatientCardHeader(userId);

  const initialTab = typeof sp.tab === "string" ? sp.tab : undefined;
  const createVisitFrom = typeof sp.createVisitFrom === "string" ? sp.createVisitFrom : undefined;

  return (
    <DoctorAppShell title="Карточка пациента" user={session.user} backHref={routePaths.doctorPatients}>
      <section className={doctorPageStackClass}>
        <PatientCardClient
          cardHeaderPromise={cardHeaderPromise}
          initialTab={initialTab}
          createVisitFrom={createVisitFrom}
        />
      </section>
    </DoctorAppShell>
  );
}
