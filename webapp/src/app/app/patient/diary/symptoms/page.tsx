import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

const EMPTY_STATE_PLACEHOLDER =
  "Скоро здесь будет ваша статистика. Для добавления записей в дневник воспользуйтесь кнопкой в меню бота.";

export default async function SymptomDiaryPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId);
  const entries = await deps.diaries.listSymptomEntries(session.user.userId);

  return (
    <AppShell title="Дневник симптомов" user={session.user} backHref="/app/patient" backLabel="Меню">
      <section className="hero-card stack">
        <p>Отслеживаемые симптомы и история записей. Добавить симптом или запись можно в боте.</p>
      </section>
      {trackings.length > 0 ? (
        <section className="panel stack">
          <h2>Отслеживаемые симптомы</h2>
          <ul className="list">
            {trackings.map((t) => (
              <li key={t.id} className="list-item">
                <strong>{t.symptomTitle ?? "—"}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="panel stack">
        <h2>Статистика</h2>
        {entries.length === 0 ? (
          <p className="empty-state">{EMPTY_STATE_PLACEHOLDER}</p>
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
