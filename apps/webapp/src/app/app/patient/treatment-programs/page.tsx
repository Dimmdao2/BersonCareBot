/**
 * Список назначенных программ лечения (`/app/patient/treatment-programs`).
 */
import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";

export default async function PatientTreatmentProgramsPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell title="Программы лечения" user={null} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className="text-sm text-muted-foreground">Войдите, чтобы увидеть назначенные программы.</p>
      </AppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPrograms);
  if (dataGate === "guest") {
    return (
      <AppShell title="Программы лечения" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className="text-sm text-muted-foreground">Раздел доступен после входа.</p>
      </AppShell>
    );
  }

  const deps = buildAppDeps();
  const list = await deps.treatmentProgramInstance.listForPatient(session.user.userId);

  return (
    <AppShell title="Программы лечения" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">У вас пока нет назначенных программ.</p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {list.map((p) => (
            <li key={p.id}>
              <Link
                href={routePaths.patientTreatmentProgram(p.id)}
                className="block rounded-xl border border-border bg-card p-4 text-sm font-medium shadow-sm transition-colors hover:border-primary/30"
              >
                {p.title}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {p.status === "completed" ? "завершена" : "активна"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
