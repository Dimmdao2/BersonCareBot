/**
 * Ports for diary modules. Implementations live in infra (in-memory or DB).
 */
import type { LfkComplex, LfkComplexExerciseLine, LfkSession, SymptomEntry, SymptomSide, SymptomTracking } from "./types";

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
  /**
   * Idempotent row for home wellbeing (`symptom_key = general_wellbeing`): one active tracking per
   * `platform_user_id`. PostgreSQL uses partial unique index + upsert (see migration `0050_symptom_general_wellbeing_unique`).
   */
  ensureGeneralWellbeingTracking(params: {
    userId: string;
    symptomTitle: string;
    symptomTypeRefId: string;
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
  /** Все записи пользователя в окне дат (для журнала), только активные трекинги. */
  listEntriesForUserInRange(params: {
    userId: string;
    fromRecordedAt: string;
    toRecordedAtExclusive: string;
    trackingId?: string | null;
    limit?: number;
  }): Promise<SymptomEntry[]>;
  /** Минимальный `recorded_at` по трекингу или null, если записей нет. */
  minRecordedAtForTracking(params: { userId: string; trackingId: string }): Promise<string | null>;
  getEntryForUser(params: { userId: string; entryId: string }): Promise<SymptomEntry | null>;
  updateEntry(params: {
    userId: string;
    entryId: string;
    value0_10: number;
    entryType: "instant" | "daily";
    recordedAt: string;
    notes: string | null;
  }): Promise<void>;
  deleteEntry(params: { userId: string; entryId: string }): Promise<void>;
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
  minCompletedAtForUser(userId: string): Promise<string | null>;
  getSessionForUser(params: { userId: string; sessionId: string }): Promise<LfkSession | null>;
  updateSession(params: {
    userId: string;
    sessionId: string;
    completedAt: string;
    durationMinutes?: number | null;
    difficulty0_10?: number | null;
    pain0_10?: number | null;
    comment?: string | null;
  }): Promise<void>;
  deleteSession(params: { userId: string; sessionId: string }): Promise<void>;
  /** B7: lines for given complexes owned by the patient (`userId` = platform user id). */
  listLfkComplexExerciseLinesForUser(params: {
    userId: string;
    complexIds: string[];
  }): Promise<Record<string, LfkComplexExerciseLine[]>>;
  /** B7: update `local_comment` on a row owned by the patient. */
  updateLfkComplexExerciseLocalCommentForUser(params: {
    userId: string;
    rowId: string;
    localComment: string | null;
  }): Promise<void>;
};
