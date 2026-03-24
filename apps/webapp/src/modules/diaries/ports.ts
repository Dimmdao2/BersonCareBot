/**
 * Ports for diary modules. Implementations live in infra (in-memory or DB).
 */
import type { LfkComplex, LfkSession, SymptomEntry, SymptomSide, SymptomTracking } from "./types";

export type SymptomDiaryPort = {
  createTracking(params: {
    userId: string;
    symptomKey?: string | null;
    symptomTitle: string;
    symptomTypeRefId?: string | null;
    regionRefId?: string | null;
    side?: SymptomSide | null;
    diagnosisText?: string | null;
    diagnosisRefId?: string | null;
    stageRefId?: string | null;
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
  /** Tracking owned by user (not soft-deleted), or null. */
  getTrackingForUser(params: { userId: string; trackingId: string }): Promise<SymptomTracking | null>;
  /** Entries for one tracking in `[fromRecordedAt, toRecordedAtExclusive)` (ISO timestamps). */
  listEntriesForTrackingInRange(params: {
    userId: string;
    trackingId: string;
    fromRecordedAt: string;
    toRecordedAtExclusive: string;
  }): Promise<SymptomEntry[]>;
  updateTrackingTitle(params: { userId: string; trackingId: string; symptomTitle: string }): Promise<void>;
  setTrackingActive(params: { userId: string; trackingId: string; isActive: boolean }): Promise<void>;
  softDeleteTracking(params: { userId: string; trackingId: string }): Promise<void>;
};

export type LfkDiaryPort = {
  createComplex(params: {
    userId: string;
    title: string;
    origin?: "manual" | "assigned_by_specialist";
    symptomTrackingId?: string | null;
    regionRefId?: string | null;
    side?: SymptomSide | null;
    diagnosisText?: string | null;
    diagnosisRefId?: string | null;
  }): Promise<LfkComplex>;
  listComplexes(userId: string, activeOnly?: boolean): Promise<LfkComplex[]>;
  addSession(params: {
    userId: string;
    complexId: string;
    completedAt: string;
    source: "bot" | "webapp";
    recordedAt?: string | null;
    durationMinutes?: number | null;
    difficulty0_10?: number | null;
    pain0_10?: number | null;
    comment?: string | null;
  }): Promise<LfkSession>;
  listSessions(userId: string, limit?: number): Promise<LfkSession[]>;
  /** Complex owned by user, or null. */
  getComplexForUser(params: { userId: string; complexId: string }): Promise<LfkComplex | null>;
  /** Sessions in `[fromCompletedAt, toCompletedAtExclusive)`; optional complex filter. */
  listSessionsInRange(params: {
    userId: string;
    fromCompletedAt: string;
    toCompletedAtExclusive: string;
    complexId?: string | null;
    limit?: number;
  }): Promise<LfkSession[]>;
};
