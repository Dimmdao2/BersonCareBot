export type SymptomEntry = {
  id: string;
  userId: string;
  symptom: string;
  severity: 1 | 2 | 3 | 4 | 5;
  notes: string | null;
  recordedAt: string;
};

/** One row = one "I exercised" session. complexId/complexTitle for future use. */
export type LfkSession = {
  id: string;
  userId: string;
  completedAt: string;
  complexId?: string | null;
  complexTitle?: string | null;
};
