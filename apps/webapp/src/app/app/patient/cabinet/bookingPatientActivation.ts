import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { redirectIfPatientAccessRequired } from '@/shared/http/apiErrorCode';

/** Ответ API booking при отсутствии tier patient или доверенного телефона для записи. */
export type BookingApiPatientGateJson = {
  error?: string;
  redirectTo?: string;
};

/**
 * Если сервер вернул patient-access отказ — редирект через общую клиентскую дверь.
 * @returns true если редирект выполнен (вызывающий коду не нужно показывать сырую ошибку).
 */
export function redirectIfPatientActivationRequired(
  json: BookingApiPatientGateJson,
  router: AppRouterInstance,
): boolean {
  return redirectIfPatientAccessRequired(json, (path) => router.push(path));
}
