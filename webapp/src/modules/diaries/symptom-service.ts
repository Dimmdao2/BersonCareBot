/**
 * Логика дневника симптомов: создание отслеживания, список отслеживаний, добавление записей и список записей.
 * Хранение данных делегировано порту (БД или память). Используется веб-приложением и API интегратора.
 */

import type { SymptomDiaryPort } from "./ports";
import type { SymptomEntry, SymptomTracking } from "./types";

export type { SymptomEntry, SymptomTracking } from "./types";

const VALUE_MIN = 0;
const VALUE_MAX = 10;

/** Создаёт сервис дневника симптомов, привязанный к переданному порту хранилища. */
export function createSymptomDiaryService(port: SymptomDiaryPort) {
  return {
    /** Создаёт новое отслеживание симптома по названию. */
    async createTracking(params: {
      userId: string;
      symptomKey?: string | null;
      symptomTitle: string;
    }): Promise<SymptomTracking> {
      const title = params.symptomTitle.trim() || "—";
      return port.createTracking({
        userId: params.userId,
        symptomKey: params.symptomKey ?? null,
        symptomTitle: title,
      });
    },
    /** Возвращает список отслеживаемых симптомов пользователя. */
    async listTrackings(userId: string, activeOnly = true): Promise<SymptomTracking[]> {
      return port.listTrackings(userId, activeOnly);
    },
    /** Добавляет запись об интенсивности симптома (балл 0–10, тип «в моменте» или «за день»). */
    async addEntry(params: {
      userId: string;
      trackingId: string;
      value0_10: number;
      entryType: "instant" | "daily";
      recordedAt: string;
      source: "bot" | "webapp" | "import";
      notes?: string | null;
    }): Promise<SymptomEntry> {
      const value = Math.min(VALUE_MAX, Math.max(VALUE_MIN, Math.round(params.value0_10)));
      return port.addEntry({
        userId: params.userId,
        trackingId: params.trackingId,
        value0_10: value,
        entryType: params.entryType,
        recordedAt: params.recordedAt,
        source: params.source,
        notes: params.notes ?? null,
      });
    },
    /** Возвращает список записей дневника симптомов пользователя. */
    async listSymptomEntries(userId: string, limit?: number): Promise<SymptomEntry[]> {
      return port.listEntries(userId, limit);
    },
  };
}
