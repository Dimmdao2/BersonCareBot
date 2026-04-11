import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/** Ответ API booking при отсутствии tier patient. */
export type BookingApiPatientGateJson = {
  error?: string;
  redirectTo?: string;
};

/**
 * Если сервер вернул patient_activation_required — редирект на привязку (или redirectTo из тела).
 * @returns true если редирект выполнен (вызывающий коду не нужно показывать сырую ошибку).
 */
export function redirectIfPatientActivationRequired(
  json: BookingApiPatientGateJson,
  router: AppRouterInstance,
): boolean {
  if (json.error !== "patient_activation_required") return false;
  const to = json.redirectTo?.trim();
  if (to && to.startsWith("/app/")) {
    router.push(to);
    return true;
  }
  router.push("/app/patient/bind-phone");
  return true;
}
