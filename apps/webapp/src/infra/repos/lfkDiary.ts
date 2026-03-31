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

  async minCompletedAtForUser(userId) {
    let min: string | null = null;
    for (const s of sessions) {
      if (s.userId !== userId) continue;
      if (!min || s.completedAt < min) min = s.completedAt;
    }
    return min;
  },

  async getSessionForUser(params) {
    const s = sessions.find((x) => x.id === params.sessionId && x.userId === params.userId);
    if (!s) return null;
    const c = complexes.find((x) => x.id === s.complexId);
    return { ...s, complexTitle: c?.title };
  },

  async updateSession(params) {
    const s = sessions.find((x) => x.id === params.sessionId && x.userId === params.userId);
    if (!s) return;
    let comment = params.comment?.trim() ?? null;
    if (comment && comment.length > 200) comment = comment.slice(0, 200);
    s.completedAt = params.completedAt;
    s.durationMinutes = params.durationMinutes ?? null;
    s.difficulty0_10 = params.difficulty0_10 ?? null;
    s.pain0_10 = params.pain0_10 ?? null;
    s.comment = comment;
  },

  async deleteSession(params) {
    const i = sessions.findIndex((x) => x.id === params.sessionId && x.userId === params.userId);
    if (i >= 0) sessions.splice(i, 1);
  },
};

/** In-memory purge для dev/tests без БД. */
export function purgeInMemoryLfkDiaryForUser(userId: string): void {
  const cIds = new Set(complexes.filter((c) => c.userId === userId).map((c) => c.id));
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i]!.userId === userId || cIds.has(sessions[i]!.complexId)) {
      sessions.splice(i, 1);
    }
  }
  for (let i = complexes.length - 1; i >= 0; i--) {
    if (complexes[i]!.userId === userId) {
      complexes.splice(i, 1);
    }
  }
}
