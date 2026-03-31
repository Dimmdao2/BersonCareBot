/** Окно редактирования записи в журнале симптомов (веб + server action). */
export const SYMPTOM_JOURNAL_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Запись можно править, если время записи (`recordedAt`) не старше 24 ч от `nowMs`. */
export function isSymptomJournalEntryEditable(recordedAtIso: string, nowMs = Date.now()): boolean {
  const t = new Date(recordedAtIso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= nowMs - SYMPTOM_JOURNAL_EDIT_WINDOW_MS;
}
