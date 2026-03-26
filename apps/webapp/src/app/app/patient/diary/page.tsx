/**
 * Единая страница дневника: вкладки «Симптомы» и «ЛФК».
 */
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess, requirePatientPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/shared/ui/AppShell";
import { AddEntryForm } from "./symptoms/AddEntryForm";
import { CreateTrackingForm } from "./symptoms/CreateTrackingForm";
import { SymptomTrackingRow } from "./symptoms/SymptomTrackingRow";
import { DiaryTabsClient } from "./DiaryTabsClient";
import { LfkSessionForm } from "./lfk/LfkSessionForm";
import { createLfkComplex } from "./lfk/actions";
import { SymptomChart } from "@/modules/diaries/components/SymptomChart";
import { LfkStatsTable } from "@/modules/diaries/components/LfkStatsTable";

const EMPTY_STATS =
  "Скоро здесь будет ваша статистика. Для добавления записей в дневник воспользуйтесь кнопкой в меню бота.";

export default async function PatientDiaryPage() {
  const session = await requirePatientAccess(routePaths.diary);
  requirePatientPhone(session, routePaths.diary);
  const deps = buildAppDeps();
  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId);
  const entries = await deps.diaries.listSymptomEntries(session.user.userId);
  const complexes = await deps.diaries.listLfkComplexes(session.user.userId);
  const lfkSessions = await deps.diaries.listLfkSessions(session.user.userId);

  const symptomsPanel = (
    <>
      <section id="patient-symptoms-diary-hero-section" className="hero-card stack">
        <h2 className="text-lg font-semibold">Добавить запись</h2>
        {trackings.length > 0 ? (
          <AddEntryForm trackings={trackings} />
        ) : (
          <p className="empty-state">Добавьте симптом для начала отслеживания.</p>
        )}
      </section>
      <section id="patient-symptoms-add-tracking-section" className="panel stack">
        <h2 className="text-lg font-semibold">Добавить симптом</h2>
        <CreateTrackingForm />
      </section>
      {trackings.length > 0 ? (
        <section id="patient-symptoms-tracking-section" className="panel stack">
          <h2 className="text-lg font-semibold">Отслеживаемые симптомы</h2>
          <ul id="patient-symptoms-tracking-list" className="list">
            {trackings.map((t) => (
              <SymptomTrackingRow key={t.id} id={t.id} title={t.symptomTitle ?? "—"} />
            ))}
          </ul>
        </section>
      ) : null}
      <section id="patient-symptoms-stats-section" className="panel stack">
        <h2 className="text-lg font-semibold">Статистика</h2>
        {trackings.length > 0 ? (
          <SymptomChart
            trackings={trackings.map((t) => ({ id: t.id, symptomTitle: t.symptomTitle ?? "—" }))}
          />
        ) : null}
        {entries.length === 0 ? (
          <p className="empty-state">{EMPTY_STATS}</p>
        ) : (
          <ul id="patient-symptoms-stats-list" className="list">
            {entries.map((entry) => (
              <li key={entry.id} id={`patient-symptoms-entry-item-${entry.id}`} className="list-item">
                <strong>{entry.symptomTitle ?? "—"}</strong> — {entry.value0_10}/10 ·{" "}
                {new Date(entry.recordedAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );

  const lfkPanel = (
    <>
      <section id="patient-lfk-diary-hero-section" className="hero-card stack">
        <h2 className="text-lg font-semibold">Отметить занятие</h2>
        <p className="text-sm text-muted-foreground">
          Комплексы ЛФК и история занятий. Добавить комплекс можно здесь или в боте.
        </p>
        {complexes.length === 0 ? (
          <div className="stack gap-3">
            <p className="text-sm text-muted-foreground">Создайте комплекс упражнений, чтобы начать отслеживать занятия.</p>
            <form action={createLfkComplex} className="stack gap-2">
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  name="complexTitle"
                  className="auth-input min-w-[200px] flex-1"
                  placeholder="Название комплекса"
                  required
                />
                <Button type="submit">Создать</Button>
              </div>
            </form>
          </div>
        ) : (
          <LfkSessionForm complexes={complexes} />
        )}
      </section>
      {complexes.length > 0 ? (
        <section id="patient-lfk-complexes-section" className="panel stack">
          <h2 className="text-lg font-semibold">Комплексы</h2>
          <ul id="patient-lfk-complexes-list" className="list">
            {complexes.map((c) => (
              <li key={c.id} id={`patient-lfk-complex-item-${c.id}`} className="list-item">
                <strong>{c.title ?? "—"}</strong>
                {c.origin === "assigned_by_specialist" ? (
                  <span className="status-pill ml-2">Назначен врачом</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section id="patient-lfk-stats-section" className="panel stack">
        <h2 className="text-lg font-semibold">Статистика</h2>
        {complexes.length > 0 ? (
          <LfkStatsTable complexes={complexes.map((c) => ({ id: c.id, title: c.title ?? "—" }))} />
        ) : null}
        {lfkSessions.length === 0 ? (
          complexes.length === 0 ? (
            <p className="empty-state">{EMPTY_STATS}</p>
          ) : null
        ) : (
          <ul id="patient-lfk-sessions-list" className="list">
            {lfkSessions.map((s) => (
              <li key={s.id} id={`patient-lfk-session-item-${s.id}`} className="list-item">
                <strong>{s.complexTitle ?? "ЛФК"}</strong>
                <span className="status-pill">{new Date(s.completedAt).toLocaleDateString("ru-RU")}</span>
                {s.durationMinutes != null ? (
                  <span className="status-pill">{s.durationMinutes} мин</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );

  return (
    <AppShell
      title="Дневник"
      user={session.user}
      backHref="/app/patient"
      backLabel="Меню"
      variant="patient"
    >
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Загрузка…</div>}>
        <DiaryTabsClient symptomsPanel={symptomsPanel} lfkPanel={lfkPanel} />
      </Suspense>
    </AppShell>
  );
}
