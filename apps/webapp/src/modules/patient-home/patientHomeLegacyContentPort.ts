/**
 * Контракт чтения legacy-блоков главной пациента.
 * Реализации живут в `infra/repos/*`; модуль держит только типы и интерфейс порта.
 */

export type HomeQuote = {
  id: string;
  body: string;
  author: string | null;
};

export type PatientHomeLegacyContentPort = {
  /** Детерминированная «цитата дня» из активных записей (стабильна в пределах суток UTC). */
  getQuoteForDay(daySeed: string, referenceDate?: Date): Promise<HomeQuote | null>;
};
