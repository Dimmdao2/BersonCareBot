/**
 * Канонический путь формы поддержки (совпадает с `routePaths.patientSupport`).
 * Без импорта БД — безопасно для client components.
 */
export const DEFAULT_PATIENT_SUPPORT_PATH = '/app/patient/support';

/**
 * Форма «написать в поддержку» до полного входа (вне дерева `/app/patient`, без patient layout).
 */
export const LOGIN_CONTACT_SUPPORT_PATH = '/app/contact-support';

/** Internal support route identity for client-only/error surfaces; not a settings fallback. */
export const DEFAULT_SUPPORT_CONTACT_URL = DEFAULT_PATIENT_SUPPORT_PATH;
