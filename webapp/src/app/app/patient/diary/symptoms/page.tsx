import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function SymptomDiaryPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const entries = await deps.diaries.listSymptomEntries(session.user.userId);

  return (
    <AppShell title="Дневник симптомов" user={session.user} backHref="/app/patient" backLabel="Меню">
      <section className="hero-card stack">
        <p>История записей о самочувствии. Записи можно добавлять в боте или здесь.</p>
      </section>
      <section className="panel stack">
        <h2>История</h2>
        {entries.length === 0 ? (
          <p className="empty-state">Пока нет записей. Добавьте симптом в боте или создайте отслеживание и запись здесь.</p>
        ) : (
          <ul className="list">
            {entries.map((entry) => (
              <li key={entry.id} className="list-item">
                <strong>{entry.symptomTitle ?? "—"}</strong> — {entry.value0_10}/10
                <span className="status-pill">{entry.entryType === "instant" ? "в моменте" : "за день"}</span>
                {entry.notes ? ` (${entry.notes})` : null}
                <span className="status-pill">{new Date(entry.recordedAt).toLocaleDateString("ru-RU")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
