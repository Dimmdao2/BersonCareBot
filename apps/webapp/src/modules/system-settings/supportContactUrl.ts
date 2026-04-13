import { routePaths } from "@/app-layer/routes/paths";
import { getConfigValue } from "@/modules/system-settings/configAdapter";
import {
  DEFAULT_PATIENT_SUPPORT_PATH,
  DEFAULT_SUPPORT_CONTACT_URL,
} from "@/modules/system-settings/supportContactConstants";

/**
 * Публичная ссылка «Написать в поддержку» (HTTPS, например t.me/…).
 * Читается из `system_settings.support_contact_url` (admin scope) с TTL-кэшем configAdapter.
 */
export async function getSupportContactUrl(): Promise<string> {
  return getConfigValue("support_contact_url", DEFAULT_SUPPORT_CONTACT_URL);
}

/**
 * Ссылка для потока входа (`/app`): внутренний путь формы под авторизованного пациента
 * (`/app/patient/support`) недоступен без сессии — подменяем на публичную форму.
 * Внешние URL из настроек не трогаем.
 */
export function resolveSupportContactHrefForLoginFlow(configured: string): string {
  const t = configured.trim();
  if (t.length === 0) return routePaths.loginContactSupport;
  if (t === DEFAULT_PATIENT_SUPPORT_PATH || t.startsWith(`${DEFAULT_PATIENT_SUPPORT_PATH}/`)) {
    return routePaths.loginContactSupport;
  }
  return t;
}
