/**
 * Symptom diary — business logic only; storage delegated to SymptomDiaryPort.
 */
import type { SymptomDiaryPort } from "./ports";
import type { SymptomEntry } from "./types";

export type { SymptomEntry } from "./types";

function createId(): string {
  return `sym-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createSymptomDiaryService(port: SymptomDiaryPort): {
  addSymptomEntry: (params: {
    userId: string;
    symptom: string;
    severity: 1 | 2 | 3 | 4 | 5;
    notes?: string | null;
  }) => SymptomEntry;
  listSymptomEntries: (userId: string, limit?: number) => SymptomEntry[];
} {
  return {
    addSymptomEntry(params) {
      const severity = Math.min(5, Math.max(1, params.severity)) as 1 | 2 | 3 | 4 | 5;
      return port.addEntry({
        userId: params.userId,
        symptom: params.symptom.trim() || "—",
        severity,
        notes: params.notes ?? null,
      });
    },
    listSymptomEntries(userId, limit) {
      return port.listEntries(userId, limit);
    },
  };
}
