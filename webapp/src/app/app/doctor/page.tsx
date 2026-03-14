import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function DoctorPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const workspace = deps.doctorCabinet.getDoctorWorkspaceState();

  return (
    <AppShell title="Интерфейс специалиста" user={session.user}>
      <section className="hero-card stack">
        <p>{workspace.message}</p>
      </section>
      <section className="panel stack">
        <h2>Список пациентов</h2>
        {workspace.patientList.length === 0 ? (
          <p className="empty-state">Список пациентов и программ будет добавлен на следующих этапах.</p>
        ) : (
          <ul className="list">
            {workspace.patientList.map((p) => (
              <li key={p.id} className="list-item">{p.label}</li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
