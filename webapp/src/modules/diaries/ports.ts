/**
 * Ports for diary modules. Implementations live in infra (in-memory or DB).
 */
import type { LfkSession, SymptomEntry } from "./types";

export type SymptomDiaryPort = {
  addEntry(params: {
    userId: string;
    symptom: string;
    severity: 1 | 2 | 3 | 4 | 5;
    notes?: string | null;
  }): Promise<SymptomEntry>;
  listEntries(userId: string, limit?: number): Promise<SymptomEntry[]>;
};

export type LfkDiaryPort = {
  addSession(params: {
    userId: string;
    completedAt: string;
    complexId?: string | null;
    complexTitle?: string | null;
  }): Promise<LfkSession>;
  listSessions(userId: string, limit?: number): Promise<LfkSession[]>;
};
