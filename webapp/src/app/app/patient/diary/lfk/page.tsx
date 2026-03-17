/**
 * Страница «Дневник ЛФК» («/app/patient/diary/lfk»).
 * Только для пациента. Вверху — описание и форма «Отметить занятие»: выбор комплекса (если их
 * несколько) и кнопка отправки. Ниже — блок «Комплексы» (список названий) и «Статистика»
 * (даты отмеченных занятий). При отсутствии комплексов показывается заглушка.
 * Кнопка «Назад» — в главное меню пациента.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { markLfkSession } from "./actions";

const EMPTY_STATE_PLACEHOLDER =
  "Скоро здесь будет ваша статистика. Для добавления записей в дневник воспользуйтесь кнопкой в меню бота.";

/** Строит страницу дневника ЛФК: описание, форма отметки занятия, списки комплексов и занятий. */
export default async function LfkDiaryPage() {
  const session = await requirePatientAccess();
  const deps = buildAppDeps();
  const complexes = await deps.diaries.listLfkComplexes(session.user.userId);
  const sessions = await deps.diaries.listLfkSessions(session.user.userId);

  return (
    <AppShell title="Дневник ЛФК" user={session.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      <section className="hero-card stack">
        <p>Комплексы ЛФК и история занятий. Добавить комплекс или отметить занятие можно в боте.</p>
        {complexes.length === 0 ? (
          <p className="empty-state">{EMPTY_STATE_PLACEHOLDER}</p>
        ) : (
          <form action={markLfkSession} className="stack">
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
        <section className="panel stack">
          <h2>Комплексы</h2>
          <ul className="list">
            {complexes.map((c) => (
              <li key={c.id} className="list-item">
                <strong>{c.title ?? "—"}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="panel stack">
        <h2>Статистика</h2>
        {sessions.length === 0 ? (
          <p className="empty-state">{EMPTY_STATE_PLACEHOLDER}</p>
        ) : (
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.id} className="list-item">
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
