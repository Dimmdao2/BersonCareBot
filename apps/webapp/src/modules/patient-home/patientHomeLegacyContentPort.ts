/**
 * Контракт чтения legacy-блоков главной пациента (рассылки, цитаты).
 * Реализации живут в `infra/repos/*`; модуль держит только типы и интерфейс порта.
 */

export type PatientHomeBanner = {
  title: string;
  variant: "info" | "important";
  key: string;
};

export type PatientHomeMailingRow = {
  id: string;
  label: string;
  sentAt: string;
  status: string;
};

export type HomeQuote = {
  id: string;
  body: string;
  author: string | null;
};

export type PatientHomeLegacyContentPort = {
  /** Первая активная тема рассылки — как «новость» на главной (важность по key/code). */
  getPatientHomeBannerTopic(): Promise<PatientHomeBanner | null>;
  listRecentMailingLogsForPlatformUser(platformUserId: string): Promise<PatientHomeMailingRow[]>;
  /** Детерминированная «цитата дня» из активных записей (стабильна в пределах суток UTC). */
  getQuoteForDay(daySeed: string, referenceDate?: Date): Promise<HomeQuote | null>;
};
