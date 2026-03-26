/**
 * Логика дневника ЛФК: комплексы упражнений и отметки занятий. Хранение делегировано порту.
 * Используется веб-приложением (страница дневника ЛФК, форма «Отметить занятие») и API интегратора для бота.
 */

import type { LfkDiaryPort } from "./ports";
import type { LfkComplex, LfkSession, SymptomSide } from "./types";

export type { LfkComplex, LfkSession } from "./types";

const COMMENT_MAX = 200;

/** Создаёт сервис дневника ЛФК, привязанный к переданному порту хранилища. */
export function createLfkDiaryService(port: LfkDiaryPort) {
  return {
    /** Создаёт новый комплекс ЛФК по названию. */
    async createComplex(params: {
      userId: string;
      title: string;
      origin?: "manual" | "assigned_by_specialist";
      symptomTrackingId?: string | null;
      regionRefId?: string | null;
      side?: SymptomSide | null;
      diagnosisText?: string | null;
      diagnosisRefId?: string | null;
    }): Promise<LfkComplex> {
      const titleTrimmed = params.title.trim() || "—";
      return port.createComplex({
        userId: params.userId,
        title: titleTrimmed,
        origin: params.origin ?? "manual",
        symptomTrackingId: params.symptomTrackingId ?? null,
        regionRefId: params.regionRefId ?? null,
        side: params.side ?? null,
        diagnosisText: params.diagnosisText ?? null,
        diagnosisRefId: params.diagnosisRefId ?? null,
      });
    },
    async listComplexes(userId: string, activeOnly = true): Promise<LfkComplex[]> {
      return port.listComplexes(userId, activeOnly);
    },
    async addLfkSession(params: {
      userId: string;
      complexId: string;
      completedAt?: string;
      source: "bot" | "webapp";
      recordedAt?: string | null;
      durationMinutes?: number | null;
      difficulty0_10?: number | null;
      pain0_10?: number | null;
      comment?: string | null;
    }): Promise<LfkSession> {
      const completedAt = params.completedAt ?? new Date().toISOString();
      let comment = params.comment?.trim() ?? null;
      if (comment && comment.length > COMMENT_MAX) {
        comment = comment.slice(0, COMMENT_MAX);
      }
      return port.addSession({
        userId: params.userId,
        complexId: params.complexId,
        completedAt,
        source: params.source,
        recordedAt: params.recordedAt ?? null,
        durationMinutes: params.durationMinutes ?? null,
        difficulty0_10: params.difficulty0_10 ?? null,
        pain0_10: params.pain0_10 ?? null,
        comment,
      });
    },
    async listLfkSessions(userId: string, limit?: number): Promise<LfkSession[]> {
      return port.listSessions(userId, limit);
    },
    async getLfkComplexForUser(params: { userId: string; complexId: string }): Promise<LfkComplex | null> {
      return port.getComplexForUser(params);
    },
    async listLfkSessionsInRange(params: {
      userId: string;
      fromCompletedAt: string;
      toCompletedAtExclusive: string;
      complexId?: string | null;
      limit?: number;
    }): Promise<LfkSession[]> {
      return port.listSessionsInRange(params);
    },
    async minCompletedAtForUser(userId: string): Promise<string | null> {
      return port.minCompletedAtForUser(userId);
    },
    async getLfkSessionForUser(params: { userId: string; sessionId: string }): Promise<LfkSession | null> {
      return port.getSessionForUser(params);
    },
    async updateLfkSession(params: {
      userId: string;
      sessionId: string;
      completedAt: string;
      durationMinutes?: number | null;
      difficulty0_10?: number | null;
      pain0_10?: number | null;
      comment?: string | null;
    }): Promise<void> {
      let comment = params.comment?.trim() ?? null;
      if (comment && comment.length > COMMENT_MAX) {
        comment = comment.slice(0, COMMENT_MAX);
      }
      await port.updateSession({ ...params, comment });
    },
    async deleteLfkSession(params: { userId: string; sessionId: string }): Promise<void> {
      await port.deleteSession(params);
    },
  };
}
