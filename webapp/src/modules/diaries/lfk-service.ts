/**
 * LFK diary — one record = one session ("I exercised"). Storage delegated to LfkDiaryPort.
 */
import type { LfkDiaryPort } from "./ports";
import type { LfkSession } from "./types";

export type { LfkSession } from "./types";

export function createLfkDiaryService(port: LfkDiaryPort): {
  addLfkSession: (params: {
    userId: string;
    completedAt?: string;
    complexId?: string | null;
    complexTitle?: string | null;
  }) => Promise<LfkSession>;
  listLfkSessions: (userId: string, limit?: number) => Promise<LfkSession[]>;
} {
  return {
    async addLfkSession(params) {
      const completedAt = params.completedAt ?? new Date().toISOString();
      return port.addSession({
        userId: params.userId,
        completedAt,
        complexId: params.complexId ?? null,
        complexTitle: params.complexTitle ?? null,
      });
    },
    async listLfkSessions(userId, limit) {
      return port.listSessions(userId, limit);
    },
  };
}
