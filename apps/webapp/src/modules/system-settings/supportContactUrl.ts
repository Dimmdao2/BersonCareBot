import { getPublicRuntimeValue } from '@/modules/system-settings/configAdapter';

/**
 * Публичная ссылка «Написать в поддержку» (HTTPS, например t.me/…).
 * Читается из `system_settings.support_contact_url` (admin scope) с TTL-кэшем configAdapter.
 */
export async function getSupportContactUrl(): Promise<string> {
  return getPublicRuntimeValue('support_contact_url', 'public_booking_config');
}
