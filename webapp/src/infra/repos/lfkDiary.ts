/**
 * In-memory implementation of LfkDiaryPort.
 * Replaced by pg when DATABASE_URL is used (see buildAppDeps).
 */
import type { LfkDiaryPort } from "@/modules/diaries/ports";
import type { LfkSession } from "@/modules/diaries/types";

const store: LfkSession[] = [];
let idCounter = 1;

export const inMemoryLfkDiaryPort: LfkDiaryPort = {
  async addSession(params) {
    const session: LfkSession = {
      id: `lfk-${idCounter++}`,
      userId: params.userId,
      completedAt: params.completedAt,
      complexId: params.complexId ?? null,
      complexTitle: params.complexTitle ?? null,
    };
    store.push(session);
    return session;
  },
  async listSessions(userId, limit = 50) {
    return store
      .filter((e) => e.userId === userId)
      .sort((a, b) => (b.completedAt > a.completedAt ? 1 : -1))
      .slice(0, limit);
  },
};
