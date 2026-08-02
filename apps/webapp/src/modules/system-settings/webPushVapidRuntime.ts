import type { SystemSettingsService } from './service';
import type { SystemSetting } from './types';
import { redactSaasBillingPaymentProviderValue } from '@/modules/saas-billing/settings';

export type WebPushVapidKeyPair = {
  publicKey: string;
  privateKey: string;
};

/**
 * Reads VAPID key pair from `system_settings` (`web_push_vapid`, scope `admin`).
 * Returns `null` if missing or malformed. Prefer this over `getConfigValue` (nested object).
 */
export async function getWebPushVapidKeyPair(
  systemSettings: Pick<SystemSettingsService, 'getSetting'>,
): Promise<WebPushVapidKeyPair | null> {
  const row = await systemSettings.getSetting('web_push_vapid', 'admin');
  const vj = row?.valueJson;
  if (vj === null || typeof vj !== 'object' || !('value' in (vj as Record<string, unknown>)))
    return null;
  const inner = (vj as Record<string, unknown>).value;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return null;
  const o = inner as Record<string, unknown>;
  const publicKey = typeof o.publicKey === 'string' ? o.publicKey.trim() : '';
  const privateKey = typeof o.privateKey === 'string' ? o.privateKey.trim() : '';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

/**
 * Strips `privateKey` from `web_push_vapid` for any HTTP/SSR surface exposed to the browser.
 * Replaces with `hasPrivateKey` so admins can tell whether a secret is stored without reading it.
 */
export function redactWebPushVapidSettingForClient(row: SystemSetting): SystemSetting {
  if (row.key !== 'web_push_vapid') return row;
  const vj = row.valueJson;
  if (vj === null || typeof vj !== 'object' || !('value' in (vj as Record<string, unknown>))) {
    return row;
  }
  const inner = (vj as Record<string, unknown>).value;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
    return row;
  }
  const o = inner as Record<string, unknown>;
  const publicKey = typeof o.publicKey === 'string' ? o.publicKey.trim() : '';
  const hasPrivateKey = typeof o.privateKey === 'string' && o.privateKey.trim().length > 0;
  return {
    ...row,
    valueJson: {
      ...(vj as Record<string, unknown>),
      value: { publicKey, hasPrivateKey },
    },
  };
}

function redactBookingPaymentProvidersSettingForClient(row: SystemSetting): SystemSetting {
  if (row.key !== 'booking_payment_providers') return row;
  const vj = row.valueJson;
  if (vj === null || typeof vj !== 'object' || !('value' in (vj as Record<string, unknown>)))
    return row;
  const inner = (vj as Record<string, unknown>).value;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return row;
  const o = inner as Record<string, unknown>;
  const providers = Array.isArray(o.providers) ? o.providers : [];
  const redacted = providers.map((item) => {
    if (item === null || typeof item !== 'object') return item;
    const p = { ...(item as Record<string, unknown>) };
    if (typeof p.webhookSecret === 'string' && p.webhookSecret.trim())
      p.webhookSecret = '[REDACTED]';
    if (typeof p.apiKey === 'string' && p.apiKey.trim()) p.apiKey = '[REDACTED]';
    return p;
  });
  return {
    ...row,
    valueJson: { value: { ...o, providers: redacted } },
  };
}

export function redactAdminSettingsForClient(settings: SystemSetting[]): SystemSetting[] {
  return settings.map((s) => {
    if (s.key === 'error_tracking_dsn') {
      const value =
        s.valueJson !== null && typeof s.valueJson === 'object'
          ? (s.valueJson as Record<string, unknown>).value
          : null;
      return {
        ...s,
        valueJson: {
          value: { hasStoredDsn: typeof value === 'string' && value.trim().length > 0 },
        },
      };
    }
    if (
      s.key === 'smsc_api_key' ||
      s.key === 'clinic_smsc_api_key' ||
      s.key === 'clinic_telegram_bot_token' ||
      s.key === 'clinic_max_bot_api_key'
    ) {
      return { ...s, valueJson: { value: '[REDACTED]' } };
    }
    if (s.key === 'clinic_smtp_outbound') {
      const value =
        s.valueJson && typeof s.valueJson === 'object' && 'value' in s.valueJson
          ? (s.valueJson as Record<string, unknown>).value
          : null;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const redacted = { ...(value as Record<string, unknown>) };
        const hasStoredPassword =
          typeof redacted.password === 'string' && redacted.password.trim().length > 0;
        delete redacted.password;
        return { ...s, valueJson: { value: { ...redacted, hasStoredPassword } } };
      }
    }
    if (s.key === 'vk_id_client_secret') {
      const value =
        s.valueJson !== null && typeof s.valueJson === 'object'
          ? (s.valueJson as Record<string, unknown>).value
          : null;
      return {
        ...s,
        valueJson: {
          value: { hasStoredSecret: typeof value === 'string' && value.trim().length > 0 },
        },
      };
    }
    if (s.key === 'auth_altcha_hmac_secret') {
      const value =
        s.valueJson !== null && typeof s.valueJson === 'object'
          ? (s.valueJson as Record<string, unknown>).value
          : null;
      return {
        ...s,
        valueJson: {
          value: { hasStoredSecret: typeof value === 'string' && value.trim().length > 0 },
        },
      };
    }
    if (s.key === 'operator_health_imap') {
      const value =
        s.valueJson && typeof s.valueJson === 'object' && 'value' in s.valueJson
          ? (s.valueJson as Record<string, unknown>).value
          : null;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const redacted = { ...(value as Record<string, unknown>) };
        const hasStoredPassword =
          typeof redacted.password === 'string' && redacted.password.trim().length > 0;
        delete redacted.password;
        return { ...s, valueJson: { value: { ...redacted, hasStoredPassword } } };
      }
    }
    if (s.key === 'web_push_vapid') return redactWebPushVapidSettingForClient(s);
    if (s.key === 'booking_payment_providers')
      return redactBookingPaymentProvidersSettingForClient(s);
    if (s.key === 'saas_billing_payment_provider') {
      return { ...s, valueJson: redactSaasBillingPaymentProviderValue(s.valueJson) };
    }
    return s;
  });
}
