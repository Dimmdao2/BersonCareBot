/**
 * Страница «Дневник ЛФК» («/app/patient/diary/lfk»).
 * Только для пациента. Вверху — описание и форма «Отметить занятие»: выбор комплекса (если их
 * несколько) и кнопка отправки. Ниже — блок «Комплексы» (список названий) и «Статистика»
 * (даты отмеченных занятий). При отсутствии комплексов — форма создания комплекса.
 * Кнопка «Назад» — в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess, requirePatientPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { createLfkComplex, markLfkSession } from "./actions";

const EMPTY_STATE_PLACEHOLDER =
  "Скоро здесь будет ваша статистика. Для добавления записей в дневник воспользуйтесь кнопкой в меню бота.";

/** Строит страницу дневника ЛФК: описание, форма отметки занятия, списки комплексов и занятий. Требуется привязка телефона. */
export default async function LfkDiaryPage() {
  const session = await requirePatientAccess(routePaths.lfk);
  requirePatientPhone(session, routePaths.lfk);
  const deps = buildAppDeps();
  const complexes = await deps.diaries.listLfkComplexes(session.user.userId);
  const sessions = await deps.diaries.listLfkSessions(session.user.userId);

  return (
    <AppShell title="Дневник ЛФК" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      <section id="patient-lfk-diary-hero-section" className="hero-card stack">
        <p>Комплексы ЛФК и история занятий. Добавить комплекс или отметить занятие можно в боте.</p>
        {complexes.length === 0 ? (
          <div className="stack" style={{ gap: 12 }}>
            <p style={{ fontSize: "0.9rem", color: "#5f6f86" }}>
              Создайте комплекс упражнений, чтобы начать отслеживать занятия.
            </p>
            <form action={createLfkComplex} className="stack" style={{ gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  name="complexTitle"
                  className="auth-input"
                  placeholder="Название комплекса"
                  required
                />
                <button type="submit" className="button">
                  Создать
                </button>
              </div>
            </form>
          </div>
        ) : (
          <form id="patient-lfk-mark-session-form" action={markLfkSession} className="stack">
            {complexes.length > 1 ? (
              <label className="stack">
                <span>Комплекс</span>
                <select name="complexId" required className="input">
                  {complexes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title ?? "—"}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="complexId" value={complexes[0].id} />
            )}
            <button type="submit" className="button">
              Отметить занятие
            </button>
          </form>
        )}
      </section>
      {complexes.length > 0 ? (
        <section id="patient-lfk-complexes-section" className="panel stack">
          <h2>Комплексы</h2>
          <ul id="patient-lfk-complexes-list" className="list">
            {complexes.map((c) => (
              <li key={c.id} id={`patient-lfk-complex-item-${c.id}`} className="list-item">
                <strong>{c.title ?? "—"}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section id="patient-lfk-stats-section" className="panel stack">
        <h2>Статистика</h2>
        {sessions.length === 0 ? (
          <p className="empty-state">{EMPTY_STATE_PLACEHOLDER}</p>
        ) : (
          <ul id="patient-lfk-sessions-list" className="list">
            {sessions.map((s) => (
              <li key={s.id} id={`patient-lfk-session-item-${s.id}`} className="list-item">
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
