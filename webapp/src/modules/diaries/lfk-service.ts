/**
 * Логика дневника ЛФК: комплексы упражнений и отметки занятий. Хранение делегировано порту.
 * Используется веб-приложением (страница дневника ЛФК, форма «Отметить занятие») и API интегратора для бота.
 */

import type { LfkDiaryPort } from "./ports";
import type { LfkComplex, LfkSession } from "./types";

export type { LfkComplex, LfkSession } from "./types";

/** Создаёт сервис дневника ЛФК, привязанный к переданному порту хранилища. */
export function createLfkDiaryService(port: LfkDiaryPort) {
  return {
    /** Создаёт новый комплекс ЛФК по названию. */
    async createComplex(params: {
      userId: string;
      title: string;
      origin?: "manual" | "assigned_by_specialist";
    }): Promise<LfkComplex> {
      const titleTrimmed = params.title.trim() || "—";
      return port.createComplex({
        userId: params.userId,
        title: titleTrimmed,
        origin: params.origin ?? "manual",
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
    }): Promise<LfkSession> {
      const completedAt = params.completedAt ?? new Date().toISOString();
      return port.addSession({
        userId: params.userId,
        complexId: params.complexId,
        completedAt,
        source: params.source,
      });
    },
    async listLfkSessions(userId: string, limit?: number): Promise<LfkSession[]> {
      return port.listSessions(userId, limit);
    },
  };
}
