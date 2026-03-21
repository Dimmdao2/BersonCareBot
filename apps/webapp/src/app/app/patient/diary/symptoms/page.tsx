/**
 * Страница «Дневник симптомов» («/app/patient/diary/symptoms»).
 * Только для пациента. Формы добавления симптома и записи, блок «Отслеживаемые симптомы» и
 * «Статистика» — список записей с баллом, типом (в моменте / за день) и датой.
 * Кнопка «Назад» — в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess, requirePatientPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { AddEntryForm } from "./AddEntryForm";
import { CreateTrackingForm } from "./CreateTrackingForm";

const EMPTY_STATE_PLACEHOLDER =
  "Скоро здесь будет ваша статистика. Для добавления записей в дневник воспользуйтесь кнопкой в меню бота.";

/** Строит страницу дневника симптомов: описание, список симптомов и список записей. Требуется привязка телефона. */
export default async function SymptomDiaryPage() {
  const session = await requirePatientAccess(routePaths.symptoms);
  requirePatientPhone(session, routePaths.symptoms);
  const deps = buildAppDeps();
  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId);
  const entries = await deps.diaries.listSymptomEntries(session.user.userId);

  return (
    <AppShell title="Дневник симптомов" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      <section id="patient-symptoms-diary-hero-section" className="hero-card stack">
        <h2>Добавить запись</h2>
        {trackings.length > 0 ? (
          <AddEntryForm trackings={trackings} />
        ) : (
          <p className="empty-state">Добавьте симптом для начала отслеживания.</p>
        )}
      </section>
      <section id="patient-symptoms-add-tracking-section" className="panel stack">
        <h2>Добавить симптом</h2>
        <CreateTrackingForm />
      </section>
      {trackings.length > 0 ? (
        <section id="patient-symptoms-tracking-section" className="panel stack">
          <h2>Отслеживаемые симптомы</h2>
          <ul id="patient-symptoms-tracking-list" className="list">
            {trackings.map((t) => (
              <li key={t.id} id={`patient-symptoms-tracking-item-${t.id}`} className="list-item">
                <strong>{t.symptomTitle ?? "—"}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section id="patient-symptoms-stats-section" className="panel stack">
        <h2>Статистика</h2>
        {entries.length === 0 ? (
          <p className="empty-state">{EMPTY_STATE_PLACEHOLDER}</p>
        ) : (
          <ul id="patient-symptoms-stats-list" className="list">
            {entries.map((entry) => (
              <li key={entry.id} id={`patient-symptoms-entry-item-${entry.id}`} className="list-item">
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
