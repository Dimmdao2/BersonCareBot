/**
 * Типы и чистые хелперы для блока новостей / «цитаты дня» на главной пациента.
 * Загрузка из БД — через `buildAppDeps().patientHomeLegacy` (`PatientHomeLegacyContentPort`).
 */

export type { HomeNews, HomeQuote } from "./patientHomeLegacyContentPort";
export { quoteDayKeyUtc, quoteIndexForDaySeed } from "./patientHomeQuoteUtils";
