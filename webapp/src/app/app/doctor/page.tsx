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
        <p className="empty-state">
          В следующих этапах сюда добавятся карточки пациентов, назначения, программы и рабочие таблицы.
        </p>
      </section>
    </AppShell>
  );
}
