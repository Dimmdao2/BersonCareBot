import type {
  PatientPracticeCompletionRow,
  PracticeSource,
  RecordPracticeInput,
} from "./types";

/** Минимальный контракт CMS для валидации материала перед записью completion. */
export type PatientPracticeContentLookupPort = {
  getById(id: string): Promise<{
    isPublished: boolean;
    archivedAt: string | null;
    deletedAt: string | null;
  } | null>;
};

export type PatientPracticePort = {
  /** Вставить строку выполнения (FK на content_pages соблюдается БД). */
  record(input: RecordPracticeInput): Promise<{ id: string }>;
  countToday(userId: string, tz: string): Promise<number>;
  streak(userId: string, tz: string): Promise<number>;
  listRecent(userId: string, limit: number): Promise<PatientPracticeCompletionRow[]>;
  getByIdForUser(completionId: string, userId: string): Promise<PatientPracticeCompletionRow | null>;
  updateFeelingById(completionId: string, userId: string, feeling: number): Promise<boolean>;
};

export type { PracticeSource };
