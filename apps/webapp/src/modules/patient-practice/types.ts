export type PracticeSource = "home" | "reminder" | "section_page" | "daily_warmup";

export type PatientPracticeCompletionRow = {
  id: string;
  userId: string;
  contentPageId: string;
  completedAt: string;
  source: PracticeSource;
  feeling: number | null;
  notes: string;
};

export type RecordPracticeInput = {
  userId: string;
  contentPageId: string;
  source: PracticeSource;
  feeling?: number | null;
  notes?: string;
};

export type RecordPracticeResult =
  | { ok: true; id: string }
  | { ok: false; error: "invalid_content_page" };
