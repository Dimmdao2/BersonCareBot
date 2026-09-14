import { notificationText } from './notificationText';

/**
 * ОДНА карта «машинный код отказа → фраза для человека» на всё приложение.
 *
 * Причина существования — прямая претензия владельца 13.09: «если у нас есть в двух разных местах
 * двумя разными названиями ошибка, которая должна показывать неверный логин или имейл — нахуя это
 * делать два раза». Третий адверсарный аудит показал, что после сведения ТЕКСТОВ в один словарь
 * проблема осталась на уровень выше: 28 кодов по-прежнему получали разные предложения, потому что
 * каждый экран держал СВОЮ карту кодов. Живой пример — панель записи и панель оплаты на ОДНОМ
 * экране врача: `payments_disabled` в одной «Оплаты в клинике отключены», в другой «Приём платежей
 * выключен для клиники»; `not_found` в одной «Запись не найдена. Обновите страницу», в другой
 * «Не удалось выполнить действие с записью».
 *
 * Правило простое: код, который может дойти до человека, описывается ЗДЕСЬ один раз. Экран не
 * пишет собственную формулировку для кода, который тут уже есть; если формулировка не подходит —
 * она правится здесь, для всех сразу.
 */
const ERROR_CODE_TEXT: Record<string, string> = {
  // --- общие ---
  invalid_body: notificationText.authInvalidBody,
  invalid_json: notificationText.authInvalidBody,
  not_found: notificationText.bookingAppointmentNotFound,
  forbidden: notificationText.authForbidden,
  unauthorized: notificationText.commonLoginRequired,
  server_error: notificationText.commonGenericError,
  rate_limited: notificationText.authTooManyAttempts,
  too_many_attempts: notificationText.authTooManyAttempts,
  entitlement_required: notificationText.bookingFeatureNotInTariff,
  idempotency_conflict: notificationText.bookingAlreadyProcessing,

  // --- коды входа и подтверждения ---
  expired_code: notificationText.authCodeInvalidOrExpired,
  invalid_code: notificationText.authCodeInvalidOrExpired,
  email_conflict: notificationText.authEmailBelongsToAnotherAccount,
  invalid_email: notificationText.commonSpecifyValidEmail,
  invalid_phone: notificationText.authPhoneInvalidFormat,

  // --- запись ---
  slot_overlap: notificationText.bookingSlotTaken,
  external_slot_taken: notificationText.bookingSlotTaken,
  not_cancelled: notificationText.bookingCancelFirst,
  appointment_not_found: notificationText.bookingAppointmentNotFound,
  appointment_financials_locked: notificationText.bookingFinancialsLocked,
  appointment_create_unavailable: notificationText.bookingCreateFailed,
  appointment_mutation_forbidden: notificationText.bookingAppointmentActionForbidden,
  lifecycle_unavailable: notificationText.bookingAppointmentActionUnavailable,
  patient_change_not_allowed: notificationText.bookingPatientChangeNotAllowed,
  patient_not_available: notificationText.bookingPatientNotAvailable,
  patient_required: notificationText.bookingPatientRequired,
  invalid_specialist: notificationText.bookingSpecialistInvalid,
  branch_not_found: notificationText.bookingBranchNotFound,
  reschedule_failed: notificationText.bookingRescheduleFailed,
  booking_calendar_unavailable: notificationText.bookingServiceTemporarilyUnavailable,
  visit_in_future: notificationText.bookingVisitInFuture,
  invalid_visit_time: notificationText.bookingVisitTimeInvalid,
  service_not_found: notificationText.bookingServiceNotFound,
  specialist_not_found: notificationText.bookingSpecialistNotFound,
  service_not_available_for_specialist: notificationText.bookingServiceNotAvailableForSpecialist,
  room_branch_mismatch: notificationText.bookingRoomBranchMismatch,
  schedule_specialist_not_configured: notificationText.bookingScheduleSpecialistNotConfigured,
  schedule_specialist_not_available: notificationText.bookingScheduleSpecialistNotAvailable,
  appointment_feed_load_failed: notificationText.bookingFeedLoadFailed,
  invalid_appointment: notificationText.authInvalidBody,
  invalid_feed_query: notificationText.authInvalidBody,
  invalid_view: notificationText.authInvalidBody,
  empty_comment: notificationText.commentTextEmpty,
  auth_captcha_secret_required: notificationText.settingsCaptchaSecretRequired,
  auth_yandex_captcha_keys_required: notificationText.settingsYandexCaptchaKeysRequired,

  // --- оплаты и абонементы ---
  payments_disabled: notificationText.bookingPaymentsDisabled,
  payments_unavailable: notificationText.bookingPaymentsUnavailable,
  payment_provider_unavailable: notificationText.bookingPaymentProviderUnavailable,
  payment_link_unavailable: notificationText.bookingPaymentProviderUnavailable,
  appointment_amount_unavailable: notificationText.bookingAppointmentAmountUnavailable,
  already_paid: notificationText.bookingAlreadyPaid,
  financials_update_failed: notificationText.bookingPaymentSaveFailed,
  package_not_found: notificationText.bookingPackageNotFound,
  catalog_package_not_found: notificationText.bookingPackageNotFound,
  catalog_not_found: notificationText.bookingPackageNotFound,
  memberships_unavailable: notificationText.bookingMembershipsUnavailable,
};

/**
 * Фраза для кода. Неизвестный код НИКОГДА не возвращается как есть: вызывающий обязан дать
 * запасной текст, и дефолт тоже текст, а не код.
 */
export function errorCodeText(
  code: string | undefined | null,
  fallback: string = notificationText.commonGenericError,
): string {
  if (!code) return fallback;
  return ERROR_CODE_TEXT[code] ?? fallback;
}

/** Есть ли у кода общая формулировка. Для экранов, которым нужно решить, писать ли свою. */
export function hasSharedErrorCodeText(code: string): boolean {
  return Object.hasOwn(ERROR_CODE_TEXT, code);
}

export const SHARED_ERROR_CODES = Object.keys(ERROR_CODE_TEXT);
