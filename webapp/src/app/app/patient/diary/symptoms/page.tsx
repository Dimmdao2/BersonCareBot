/**
 * Страница «Дневник симптомов» («/app/patient/diary/symptoms»).
 * Только для пациента. Вверху — пояснение, что записи добавляются в боте. Далее блок
 * «Отслеживаемые симптомы» (список названий) и блок «Статистика» — список записей с баллом,
 * типом (в моменте / за день) и датой. При отсутствии данных показывается заглушка.
 * Кнопка «Назад» — в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess, requirePatientPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";

const EMPTY_STATE_PLACEHOLDER =
  "Скоро здесь будет ваша статистика. Для добавления записей в дневник воспользуйтесь кнопкой в меню бота.";

/** Строит страницу дневника симптомов: описание, список симптомов и список записей. Требуется привязка телефона. */
export default async function SymptomDiaryPage() {
  const session = await requirePatientAccess();
  requirePatientPhone(session, routePaths.symptoms);
  const deps = buildAppDeps();
  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId);
  const entries = await deps.diaries.listSymptomEntries(session.user.userId);

  return (
    <AppShell title="Дневник симптомов" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
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
