/**
 * In-memory implementation of LfkDiaryPort.
 * MVP: replace with DB-backed repo when scaling (e.g. table webapp.lfk_completions).
 */
import type { LfkDiaryPort } from "@/modules/diaries/ports";
import type { LfkCompletion } from "@/modules/diaries/types";

const store: LfkCompletion[] = [];
let idCounter = 1;

export const inMemoryLfkDiaryPort: LfkDiaryPort = {
  addCompletion(params) {
    const entry: LfkCompletion = {
      id: `lfk-${idCounter++}`,
      userId: params.userId,
      exerciseId: params.exerciseId,
      exerciseTitle: params.exerciseTitle,
      completedAt: new Date().toISOString(),
    };
    store.push(entry);
    return entry;
  },
  listCompletions(userId, limit = 50) {
    return store
      .filter((e) => e.userId === userId)
      .sort((a, b) => (b.completedAt > a.completedAt ? 1 : -1))
      .slice(0, limit);
  },
};
