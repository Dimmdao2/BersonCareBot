import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function LfkDiaryPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const completions = deps.diaries.listLfkCompletions(session.user.userId);

  return (
    <AppShell title="Дневник ЛФК" user={session.user}>
      <section className="hero-card stack">
        <p>История выполненных упражнений. В MVP данные в памяти; позже — напоминания и точки входа из раздела уроков.</p>
      </section>
      <section className="panel stack">
        <h2>История</h2>
        {completions.length === 0 ? (
          <p className="empty-state">Выполнений пока нет.</p>
        ) : (
          <ul className="list">
            {completions.map((c) => (
              <li key={c.id} className="list-item">
                <strong>{c.exerciseTitle}</strong>
                <span className="status-pill">{new Date(c.completedAt).toLocaleDateString("ru-RU")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
