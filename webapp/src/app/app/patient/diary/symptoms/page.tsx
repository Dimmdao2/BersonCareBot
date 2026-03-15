import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

/** Мок-записи для отображения структуры раздела (когда своих записей ещё нет). */
const MOCK_ENTRIES = [
  { id: "m1", symptom: "Напряжение в шее", severity: 3, notes: "после работы за компьютером", recordedAt: "2025-03-14T10:00:00" },
  { id: "m2", symptom: "Дискомфорт в пояснице", severity: 2, notes: null, recordedAt: "2025-03-13T18:30:00" },
  { id: "m3", symptom: "Головная боль", severity: 4, notes: "с утра", recordedAt: "2025-03-12T08:00:00" },
];

export default async function SymptomDiaryPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const entries = await deps.diaries.listSymptomEntries(session.user.userId);
  const displayEntries = entries.length > 0 ? entries : MOCK_ENTRIES;

  return (
    <AppShell title="Дневник симптомов" user={session.user} backHref="/app/patient" backLabel="Меню">
      <section className="hero-card stack">
        <p>История записей о самочувствии. Сохранение и напоминания из мессенджера — в следующих версиях.</p>
      </section>
      <section className="panel stack">
        <h2>История</h2>
        <ul className="list">
          {displayEntries.map((entry) => (
            <li key={entry.id} className="list-item">
              <strong>{entry.symptom}</strong> — {entry.severity}/5
              {entry.notes ? ` (${entry.notes})` : null}
              <span className="status-pill">{new Date(entry.recordedAt).toLocaleDateString("ru-RU")}</span>
            </li>
          ))}
        </ul>
        {entries.length === 0 && <p className="empty-state">Это примеры записей. Ваши появятся после добавления.</p>}
      </section>
    </AppShell>
  );
}
