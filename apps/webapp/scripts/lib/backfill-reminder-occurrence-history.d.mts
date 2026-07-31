export type FinalizedOccurrenceHistoryRow = {
  id: string | number;
  organization_id?: string | null;
  [key: string]: unknown;
};

export type OccurrenceHistoryBackfillTarget = {
  listExistingOccurrenceIds(ids: string[]): Promise<Set<string>>;
  insertOccurrenceHistoryIfAbsent(row: FinalizedOccurrenceHistoryRow): Promise<boolean>;
};

export function backfillReminderOccurrenceHistoryRows(
  rows: FinalizedOccurrenceHistoryRow[],
  target: OccurrenceHistoryBackfillTarget,
): Promise<{ inserted: number; preserved: number }>;
