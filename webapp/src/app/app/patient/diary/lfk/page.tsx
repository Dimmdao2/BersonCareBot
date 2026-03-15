import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { markLfkSession } from "./actions";

/** Мок-записи для отображения структуры раздела (одна запись = одно занятие). */
const MOCK_SESSIONS = [
  { id: "m1", completedAt: "2025-03-14T09:15:00", complexTitle: null as string | null },
  { id: "m2", completedAt: "2025-03-13T19:00:00", complexTitle: "Разминка для шеи" },
  { id: "m3", completedAt: "2025-03-12T08:30:00", complexTitle: null as string | null },
];

export default async function LfkDiaryPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const sessions = await deps.diaries.listLfkSessions(session.user.userId);
  const displaySessions = sessions.length > 0 ? sessions : MOCK_SESSIONS;

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
        <ul className="list">
          {displaySessions.map((s) => (
            <li key={s.id} className="list-item">
              {s.complexTitle ? <strong>{s.complexTitle}</strong> : <span>Занятие</span>}
              <span className="status-pill">{new Date(s.completedAt).toLocaleDateString("ru-RU")}</span>
            </li>
          ))}
        </ul>
        {sessions.length === 0 && <p className="empty-state">Это примеры. Ваши занятия появятся после отметки или записи из бота.</p>}
      </section>
    </AppShell>
  );
}
