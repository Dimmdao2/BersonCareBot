import { getConfigValue } from "@/modules/system-settings/configAdapter";
import { DEFAULT_SUPPORT_CONTACT_URL } from "@/modules/system-settings/supportContactConstants";

/**
 * Публичная ссылка «Написать в поддержку» (HTTPS, например t.me/…).
 * Читается из `system_settings.support_contact_url` (admin scope) с TTL-кэшем configAdapter.
 */
export async function getSupportContactUrl(): Promise<string> {
  return getConfigValue("support_contact_url", DEFAULT_SUPPORT_CONTACT_URL);
}
