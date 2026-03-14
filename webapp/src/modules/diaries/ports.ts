/**
 * Ports for diary modules. Implementations live in infra (in-memory or DB).
 */
import type { LfkCompletion, SymptomEntry } from "./types";

export type SymptomDiaryPort = {
  addEntry(params: {
    userId: string;
    symptom: string;
    severity: 1 | 2 | 3 | 4 | 5;
    notes?: string | null;
  }): SymptomEntry;
  listEntries(userId: string, limit?: number): SymptomEntry[];
};

export type LfkDiaryPort = {
  addCompletion(params: {
    userId: string;
    exerciseId: string;
    exerciseTitle: string;
  }): LfkCompletion;
  listCompletions(userId: string, limit?: number): LfkCompletion[];
};
