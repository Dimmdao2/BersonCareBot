/**
 * LFK (exercise) diary — MVP: in-memory completions; later reminders + entry points.
 */
export type LfkCompletion = {
  id: string;
  userId: string;
  exerciseId: string;
  exerciseTitle: string;
  completedAt: string; // ISO
};

const store: LfkCompletion[] = [];
let idCounter = 1;

export function addLfkCompletion(params: {
  userId: string;
  exerciseId: string;
  exerciseTitle: string;
}): LfkCompletion {
  const entry: LfkCompletion = {
    id: `lfk-${idCounter++}`,
    userId: params.userId,
    exerciseId: params.exerciseId,
    exerciseTitle: params.exerciseTitle,
    completedAt: new Date().toISOString(),
  };
  store.push(entry);
  return entry;
}

export function listLfkCompletions(userId: string, limit = 50): LfkCompletion[] {
  return store
    .filter((e) => e.userId === userId)
    .sort((a, b) => (b.completedAt > a.completedAt ? 1 : -1))
    .slice(0, limit);
}
