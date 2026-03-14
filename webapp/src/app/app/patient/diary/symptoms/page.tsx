import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function SymptomDiaryPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const entries = deps.diaries.listSymptomEntries(session.user.userId);

  return (
    <AppShell title="Дневник симптомов" user={session.user}>
      <section className="hero-card stack">
        <p>Здесь отображается история записей о самочувствии. В MVP данные хранятся в памяти; позже — сохранение и напоминания из мессенджера.</p>
      </section>
      <section className="panel stack">
        <h2>История</h2>
        {entries.length === 0 ? (
          <p className="empty-state">Записей пока нет.</p>
        ) : (
          <ul className="list">
            {entries.map((entry) => (
              <li key={entry.id} className="list-item">
                <strong>{entry.symptom}</strong> — {entry.severity}/5
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
