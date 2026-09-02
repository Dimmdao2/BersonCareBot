import {
  normalizePlatformIntegrationAvailability,
  type PlatformIntegrationAvailability,
  type PlatformIntegrationId,
} from '@bersoncare/shared-contracts';
import { RuntimeSettingUnavailableError } from './runtimeSettingUnavailable';

export {
  PLATFORM_INTEGRATION_IDS,
  normalizePlatformIntegrationAvailability,
  isPlatformIntegrationAvailable,
} from '@bersoncare/shared-contracts';
export type {
  PlatformIntegrationAvailability,
  PlatformIntegrationId,
} from '@bersoncare/shared-contracts';

export type PlatformIntegrationCatalogEntry = Readonly<{
  id: PlatformIntegrationId;
  label: string;
  implementation: 'available' | 'declared';
  clinicConfiguration:
    'tariff_gated_sender_credentials' | 'clinic_calendar_connection' | 'platform_managed';
  clinicHint: string;
}>;

/**
 * The catalog is code-owned shape, not switch state. It lists only operational
 * adapters that are wired in this repository, plus Yandex Calendar requested as
 * a declared future adapter.
 */
export const PLATFORM_INTEGRATION_CATALOG: readonly PlatformIntegrationCatalogEntry[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    implementation: 'available',
    clinicConfiguration: 'tariff_gated_sender_credentials',
    clinicHint:
      'Клиника сможет подключить своего бота, когда тариф разрешает брендирование; иначе используется отправитель платформы.',
  },
  {
    id: 'max',
    label: 'MAX',
    implementation: 'available',
    clinicConfiguration: 'tariff_gated_sender_credentials',
    clinicHint:
      'Клиника сможет подключить своего бота, когда тариф разрешает брендирование; иначе используется отправитель платформы.',
  },
  {
    id: 'vk',
    label: 'ВКонтакте',
    implementation: 'available',
    clinicConfiguration: 'tariff_gated_sender_credentials',
    clinicHint:
      'Клиника сможет подключить сообщество, когда тариф разрешает брендирование; иначе используется сообщество платформы.',
  },
  {
    id: 'email',
    label: 'Email (SMTP)',
    implementation: 'available',
    clinicConfiguration: 'tariff_gated_sender_credentials',
    clinicHint:
      'Клиника сможет указать свой SMTP, когда тариф разрешает брендирование; иначе используется SMTP платформы.',
  },
  {
    id: 'smsc',
    label: 'SMS (SMSC)',
    implementation: 'available',
    clinicConfiguration: 'tariff_gated_sender_credentials',
    clinicHint:
      'Локальный SMS-провайдер и пакеты SMS относятся к отдельному клиническому и тарифному слайсу.',
  },
  {
    id: 'web_push',
    label: 'Web Push',
    implementation: 'available',
    clinicConfiguration: 'platform_managed',
    clinicHint:
      'Ключи Web Push управляются платформой; клиника не получает доступ к платформенному секрету VAPID.',
  },
  {
    id: 'google_calendar',
    label: 'Google Calendar',
    implementation: 'available',
    clinicConfiguration: 'clinic_calendar_connection',
    clinicHint:
      'Клиника будет подключать свой аккаунт и выбирать календарь локально; клинический экран ещё не входит в этот слайс.',
  },
  {
    id: 'yandex_calendar',
    label: 'Яндекс Календарь',
    implementation: 'declared',
    clinicConfiguration: 'clinic_calendar_connection',
    clinicHint:
      'Синхронизация и клиническое OAuth/CalDAV-подключение ещё не реализованы; этот рубильник резервирует платформенную доступность.',
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Throws only when the envelope itself is malformed (not a record, or an unsupported/invalid
 * `version`/`integrations` shape). A missing or malformed individual id is not an envelope
 * failure: it surfaces as an absent key in `.integrations`, and callers reading a specific id
 * must treat that as denied for that id, not as a reason to distrust the whole registry.
 */
export function parsePlatformIntegrationAvailabilityEnvelope(
  envelope: unknown,
): PlatformIntegrationAvailability {
  if (!isRecord(envelope)) {
    throw new RuntimeSettingUnavailableError('platform_integration_availability');
  }
  const value = normalizePlatformIntegrationAvailability(envelope.value);
  if (value === null) {
    throw new RuntimeSettingUnavailableError('platform_integration_availability');
  }
  return value;
}
