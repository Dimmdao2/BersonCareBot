export type SymptomEntry = {
  id: string;
  userId: string;
  symptom: string;
  severity: 1 | 2 | 3 | 4 | 5;
  notes: string | null;
  recordedAt: string;
};

export type LfkCompletion = {
  id: string;
  userId: string;
  exerciseId: string;
  exerciseTitle: string;
  completedAt: string;
};
