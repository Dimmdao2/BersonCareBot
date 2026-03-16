/**
 * In-memory implementation of LfkDiaryPort.
 */
import type { LfkDiaryPort } from "@/modules/diaries/ports";
import type { LfkComplex, LfkSession } from "@/modules/diaries/types";

const complexes: LfkComplex[] = [];
const sessions: LfkSession[] = [];
let complexIdCounter = 1;
let sessionIdCounter = 1;

export const inMemoryLfkDiaryPort: LfkDiaryPort = {
  async createComplex(params) {
    const now = new Date().toISOString();
    const complex: LfkComplex = {
      id: `lfk-c-${complexIdCounter++}`,
      userId: params.userId,
      title: params.title,
      origin: params.origin ?? "manual",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    complexes.push(complex);
    return complex;
  },

  async listComplexes(userId, activeOnly = true) {
    return complexes
      .filter((c) => c.userId === userId && (!activeOnly || c.isActive))
      .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  },

  async addSession(params) {
    const complex = complexes.find((c) => c.id === params.complexId);
    const session: LfkSession = {
      id: `lfk-s-${sessionIdCounter++}`,
      userId: params.userId,
      complexId: params.complexId,
      completedAt: params.completedAt,
      source: params.source,
      createdAt: new Date().toISOString(),
      complexTitle: complex?.title,
    };
    sessions.push(session);
    return session;
  },

  async listSessions(userId, limit = 50) {
    return sessions
      .filter((s) => s.userId === userId)
      .sort((a, b) => (b.completedAt > a.completedAt ? 1 : -1))
      .slice(0, limit)
      .map((s) => {
        const c = complexes.find((x) => x.id === s.complexId);
        return { ...s, complexTitle: c?.title };
      });
  },
};
