/**
 * Главная страница врача/админа («/app/doctor»).
 * Показывается только пользователям с ролью врач или админ. Сообщение из «рабочего пространства»
 * и блок «Список пациентов» (пока заглушка или список из конфигурации). Кнопка «Назад» не выводится.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

/** Строит главную страницу врача: оболочка, приветственный блок и список пациентов. */
export default async function DoctorPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const workspace = deps.doctorCabinet.getDoctorWorkspaceState();

  return (
    <AppShell title="Главное меню" user={session.user} titleSmall>
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
