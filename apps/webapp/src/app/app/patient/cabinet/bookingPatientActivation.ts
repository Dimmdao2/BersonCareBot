import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/** Ответ API booking при отсутствии tier patient или доверенного телефона для записи. */
export type BookingApiPatientGateJson = {
  error?: string;
  redirectTo?: string;
};

const BOOKING_GATE_REDIRECT_ERRORS = new Set(["patient_activation_required", "booking_phone_trust_required"]);

/**
 * Если сервер вернул `patient_activation_required` или `booking_phone_trust_required` — редирект на привязку / redirectTo из тела.
 * @returns true если редирект выполнен (вызывающий коду не нужно показывать сырую ошибку).
 */
export function redirectIfPatientActivationRequired(
  json: BookingApiPatientGateJson,
  router: AppRouterInstance,
): boolean {
  if (!json.error || !BOOKING_GATE_REDIRECT_ERRORS.has(json.error)) return false;
  const to = json.redirectTo?.trim();
  if (to && to.startsWith("/app/")) {
    router.push(to);
    return true;
  }
  router.push("/app/patient/bind-phone");
  return true;
}
