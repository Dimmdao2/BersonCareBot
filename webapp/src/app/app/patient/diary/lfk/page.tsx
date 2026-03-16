import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { markLfkSession } from "./actions";

export default async function LfkDiaryPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const sessions = await deps.diaries.listLfkSessions(session.user.userId);

  return (
    <AppShell title="Дневник ЛФК" user={session.user} backHref="/app/patient" backLabel="Меню">
      <section className="hero-card stack">
        <p>История занятий ЛФК. Комплексы и напоминания — в следующих версиях.</p>
        <form action={markLfkSession} className="stack">
          <button type="submit" className="button">
            Отметить занятие
          </button>
        </form>
      </section>
      <section className="panel stack">
        <h2>История</h2>
        {sessions.length === 0 ? (
          <p className="empty-state">Пока нет занятий. Отметьте занятие или добавьте комплекс и запись из бота.</p>
        ) : (
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.id} className="list-item">
                <strong>{s.complexTitle ?? "ЛФК"}</strong>
                <span className="status-pill">{new Date(s.completedAt).toLocaleDateString("ru-RU")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
