/**
 * Типы и чистые хелперы для «цитаты дня» на главной пациента.
 * Загрузка из БД — через `buildAppDeps().patientHomeLegacy` (`PatientHomeLegacyContentPort`).
 */

export type { HomeQuote } from "./patientHomeLegacyContentPort";
export { quoteDayKeyUtc, quoteIndexForDaySeed } from "./patientHomeQuoteUtils";
