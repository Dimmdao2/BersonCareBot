/**
 * Канонический путь формы поддержки (совпадает с `routePaths.patientSupport`).
 * Без импорта БД — безопасно для client components.
 */
export const DEFAULT_PATIENT_SUPPORT_PATH = "/app/patient/support";

/** Fallback, если в `system_settings` нет `support_contact_url`. */
export const DEFAULT_SUPPORT_CONTACT_URL = DEFAULT_PATIENT_SUPPORT_PATH;
