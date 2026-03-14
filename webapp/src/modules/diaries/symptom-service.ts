/**
 * Symptom diary — MVP: in-memory store; later persistence + reminder entry points.
 */
export type SymptomEntry = {
  id: string;
  userId: string;
  symptom: string;
  severity: 1 | 2 | 3 | 4 | 5;
  notes: string | null;
  recordedAt: string; // ISO
};

const store: SymptomEntry[] = [];
let idCounter = 1;

export function addSymptomEntry(params: {
  userId: string;
  symptom: string;
  severity: 1 | 2 | 3 | 4 | 5;
  notes?: string | null;
}): SymptomEntry {
  const entry: SymptomEntry = {
    id: `sym-${idCounter++}`,
    userId: params.userId,
    symptom: params.symptom,
    severity: params.severity,
    notes: params.notes ?? null,
    recordedAt: new Date().toISOString(),
  };
  store.push(entry);
  return entry;
}

export function listSymptomEntries(userId: string, limit = 50): SymptomEntry[] {
  return store
    .filter((e) => e.userId === userId)
    .sort((a, b) => (b.recordedAt > a.recordedAt ? 1 : -1))
    .slice(0, limit);
}
