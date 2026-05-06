/**
 * Ключ для агрегирования отметок `done` в `program_action_log`: элемент назначения
 * или под-юнит (упражнение в снимке ЛФК-комплекса, тест в наборе).
 */
export function programActionDoneActivityKey(
  instanceStageItemId: string,
  payload: Record<string, unknown> | null | undefined,
): string {
  const p = payload ?? null;
  const ex = typeof p?.exerciseId === "string" ? p.exerciseId.trim() : "";
  const tid = typeof p?.testId === "string" ? p.testId.trim() : "";
  if (ex) return `${instanceStageItemId}:ex:${ex}`;
  if (tid) return `${instanceStageItemId}:test:${tid}`;
  return instanceStageItemId;
}

/** Строка `exercises[]` в снимке элемента `lfk_complex` (PG-снимок). */
export type LfkSnapshotExerciseLine = {
  exerciseId: string;
  title: string;
  sortOrder: number;
  /** Как в снимке `exercise`: массив `{ url, type, sortOrder, previewSmUrl?, … }`; у старых инстансов может отсутствовать. */
  media?: unknown;
};

/** Строки упражнений из снимка элемента `lfk_complex` (пациентский UI и отметки по `exerciseId`). */
export function listLfkSnapshotExerciseLines(snapshot: Record<string, unknown>): LfkSnapshotExerciseLine[] {
  const raw = snapshot.exercises;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const rows: LfkSnapshotExerciseLine[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const exerciseId = typeof o.exerciseId === "string" ? o.exerciseId.trim() : "";
    if (!exerciseId) continue;
    const titleRaw = typeof o.title === "string" ? o.title.trim() : "";
    const sortOrder =
      typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder) ? o.sortOrder : 0;
    const media = o.media;
    const line: LfkSnapshotExerciseLine = {
      exerciseId,
      title: titleRaw || "Упражнение",
      sortOrder,
    };
    if (Array.isArray(media) && media.length > 0 && media.every((e) => e != null && typeof e === "object" && !Array.isArray(e))) {
      line.media = media;
    }
    rows.push(line);
  }
  rows.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"));
  return rows;
}
