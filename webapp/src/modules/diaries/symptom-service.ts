/**
 * Symptom diary — business logic only; storage delegated to SymptomDiaryPort.
 */
import type { SymptomDiaryPort } from "./ports";
import type { SymptomEntry } from "./types";

export type { SymptomEntry } from "./types";

export function createSymptomDiaryService(port: SymptomDiaryPort): {
  addSymptomEntry: (params: {
    userId: string;
    symptom: string;
    severity: 1 | 2 | 3 | 4 | 5;
    notes?: string | null;
  }) => Promise<SymptomEntry>;
  listSymptomEntries: (userId: string, limit?: number) => Promise<SymptomEntry[]>;
} {
  return {
    async addSymptomEntry(params) {
      const severity = Math.min(5, Math.max(1, params.severity)) as 1 | 2 | 3 | 4 | 5;
      return port.addEntry({
        userId: params.userId,
        symptom: params.symptom.trim() || "—",
        severity,
        notes: params.notes ?? null,
      });
    },
    async listSymptomEntries(userId, limit) {
      return port.listEntries(userId, limit);
    },
  };
}
