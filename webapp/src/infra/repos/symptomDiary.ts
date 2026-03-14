/**
 * In-memory implementation of SymptomDiaryPort.
 * MVP: replace with DB-backed repo when scaling (e.g. table webapp.symptom_entries).
 */
import type { SymptomDiaryPort } from "@/modules/diaries/ports";
import type { SymptomEntry } from "@/modules/diaries/types";

const store: SymptomEntry[] = [];
let idCounter = 1;

export const inMemorySymptomDiaryPort: SymptomDiaryPort = {
  addEntry(params) {
    const entry: SymptomEntry = {
      id: `sym-${idCounter++}`,
      userId: params.userId,
      symptom: params.symptom,
      severity: params.severity,
      notes: params.notes ?? null,
      recordedAt: new Date().toISOString(),
    };
    store.push(entry);
    return entry;
  },
  listEntries(userId, limit = 50) {
    return store
      .filter((e) => e.userId === userId)
      .sort((a, b) => (b.recordedAt > a.recordedAt ? 1 : -1))
      .slice(0, limit);
  },
};
