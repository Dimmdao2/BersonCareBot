/**
 * B7 FIX: чтение строк `tests[]` в снимке элемента программы (тип элемента **`clinical_test`**
 * после разворота из набора; legacy **`test_set`** в старых данных).
 * Комментарии позиций — из каталога `test_set_items` в PG-снимке; legacy JSON без ключа — без комментария.
 */

export type TestSetSnapshotTestLine = {
  testId: string;
  title: string | null;
  /** Комментарий к позиции в наборе (каталог); null если нет или только пробелы. */
  comment: string | null;
  /** Снимок `scoring` клинического теста на момент назначения; null если нет в JSON. */
  scoringConfig: unknown | null;
};

function snapshotTestComment(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t || null;
}

export function parseTestSetSnapshotTests(snapshot: Record<string, unknown>): TestSetSnapshotTestLine[] {
  const arr = snapshot.tests;
  if (!Array.isArray(arr)) return [];
  const out: TestSetSnapshotTestLine[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object" || !("testId" in entry)) continue;
    const testId = String((entry as { testId: unknown }).testId).trim();
    if (!testId) continue;
    const title =
      "title" in entry && typeof (entry as { title: unknown }).title === "string"
        ? (entry as { title: string }).title
        : null;
    const comment = snapshotTestComment((entry as { comment?: unknown }).comment);
    const scoringConfig =
      "scoringConfig" in entry ? ((entry as { scoringConfig?: unknown }).scoringConfig ?? null) : null;
    out.push({ testId, title, comment, scoringConfig });
  }
  return out;
}

/** Идентификаторы тестов из `snapshot.tests[]` (порядок как в снимке). */
export function testIdsFromTestSetSnapshot(snapshot: Record<string, unknown>): string[] {
  return parseTestSetSnapshotTests(snapshot).map((line) => line.testId);
}
