/**
 * Copies finalized reminder occurrences without changing rows already present in history.
 *
 * The target adapter still has to use an atomic insert-if-absent operation: the explicit
 * existing-id read keeps reruns cheap, while the insert protects concurrent backfills.
 */
export async function backfillReminderOccurrenceHistoryRows(rows, target) {
  const occurrenceIds = rows.map((row) => String(row.id));
  const existingIds = await target.listExistingOccurrenceIds(occurrenceIds);
  let inserted = 0;
  let preserved = 0;

  for (const row of rows) {
    const occurrenceId = String(row.id);
    if (existingIds.has(occurrenceId)) {
      preserved += 1;
      continue;
    }
    if (typeof row.organization_id !== 'string' || row.organization_id.trim() === '') {
      throw new Error(`finalized occurrence ${occurrenceId} has no proven organization_id`);
    }

    const didInsert = await target.insertOccurrenceHistoryIfAbsent(row);
    if (didInsert) {
      existingIds.add(occurrenceId);
      inserted += 1;
    } else {
      preserved += 1;
    }
  }

  return { inserted, preserved };
}
