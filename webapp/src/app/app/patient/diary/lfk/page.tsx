import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

/** Мок-записи для отображения структуры раздела. */
const MOCK_COMPLETIONS = [
  { id: "m1", exerciseTitle: "Разминка для шеи", completedAt: "2025-03-14T09:15:00" },
  { id: "m2", exerciseTitle: "Базовые принципы разгрузки спины", completedAt: "2025-03-13T19:00:00" },
  { id: "m3", exerciseTitle: "Разминка для шеи", completedAt: "2025-03-12T08:30:00" },
];

export default async function LfkDiaryPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const completions = deps.diaries.listLfkCompletions(session.user.userId);
  const displayCompletions = completions.length > 0 ? completions : MOCK_COMPLETIONS;

  return (
    <AppShell title="Дневник ЛФК" user={session.user} backHref="/app/patient" backLabel="Меню">
      <section className="hero-card stack">
        <p>История выполненных упражнений. Напоминания и связь с разделом уроков — в следующих версиях.</p>
      </section>
      <section className="panel stack">
        <h2>История</h2>
        <ul className="list">
          {displayCompletions.map((c) => (
            <li key={c.id} className="list-item">
              <strong>{c.exerciseTitle}</strong>
              <span className="status-pill">{new Date(c.completedAt).toLocaleDateString("ru-RU")}</span>
            </li>
          ))}
        </ul>
        {completions.length === 0 && <p className="empty-state">Это примеры. Ваши выполнения появятся после прохождения уроков.</p>}
      </section>
    </AppShell>
  );
}
