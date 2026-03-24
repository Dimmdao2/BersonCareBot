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
      symptomTrackingId: params.symptomTrackingId ?? null,
      regionRefId: params.regionRefId ?? null,
      side: params.side ?? null,
      diagnosisText: params.diagnosisText ?? null,
      diagnosisRefId: params.diagnosisRefId ?? null,
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
      recordedAt: params.recordedAt ?? null,
      durationMinutes: params.durationMinutes ?? null,
      difficulty0_10: params.difficulty0_10 ?? null,
      pain0_10: params.pain0_10 ?? null,
      comment: params.comment ?? null,
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

  async getComplexForUser(params) {
    const c = complexes.find((x) => x.id === params.complexId && x.userId === params.userId);
    return c ?? null;
  },

  async listSessionsInRange(params) {
    const lim = Math.min(params.limit ?? 2000, 5000);
    const fromMs = new Date(params.fromCompletedAt).getTime();
    const toEx = new Date(params.toCompletedAtExclusive).getTime();
    return sessions
      .filter((s) => {
        if (s.userId !== params.userId) return false;
        if (params.complexId && s.complexId !== params.complexId) return false;
        const ts = new Date(s.completedAt).getTime();
        return ts >= fromMs && ts < toEx;
      })
      .sort((a, b) => (b.completedAt > a.completedAt ? 1 : -1))
      .slice(0, lim)
      .map((s) => {
        const c = complexes.find((x) => x.id === s.complexId);
        return { ...s, complexTitle: c?.title };
      });
  },
};
