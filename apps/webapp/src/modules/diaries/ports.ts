/**
 * Ports for diary modules. Implementations live in infra (in-memory or DB).
 */
import type { LfkComplex, LfkSession, SymptomEntry, SymptomTracking } from "./types";

export type SymptomDiaryPort = {
  createTracking(params: {
    userId: string;
    symptomKey?: string | null;
    symptomTitle: string;
  }): Promise<SymptomTracking>;
  listTrackings(userId: string, activeOnly?: boolean): Promise<SymptomTracking[]>;
  addEntry(params: {
    userId: string;
    trackingId: string;
    value0_10: number;
    entryType: "instant" | "daily";
    recordedAt: string;
    source: "bot" | "webapp" | "import";
    notes?: string | null;
  }): Promise<SymptomEntry>;
  listEntries(userId: string, limit?: number): Promise<SymptomEntry[]>;
};

export type LfkDiaryPort = {
  createComplex(params: { userId: string; title: string; origin?: "manual" | "assigned_by_specialist" }): Promise<LfkComplex>;
  listComplexes(userId: string, activeOnly?: boolean): Promise<LfkComplex[]>;
  addSession(params: {
    userId: string;
    complexId: string;
    completedAt: string;
    source: "bot" | "webapp";
  }): Promise<LfkSession>;
  listSessions(userId: string, limit?: number): Promise<LfkSession[]>;
};
