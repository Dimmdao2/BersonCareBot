import type { DbPort } from '../../kernel/contracts/index.js';
import {
  extractSystemSettingInnerValue,
  fetchPublicSystemSettingValueJson,
} from './publicSystemSettings.js';

export type AuthChannel = 'email' | 'sms' | 'telegram' | 'max';

const SETTING_BY_CHANNEL: Readonly<Record<AuthChannel, string>> = {
  email: 'auth_email_enabled',
  sms: 'auth_sms_enabled',
  telegram: 'auth_telegram_enabled',
  max: 'auth_max_enabled',
};

const DEFAULT_BY_CHANNEL: Readonly<Record<AuthChannel, boolean>> = {
  email: true,
  sms: false,
  telegram: true,
  max: true,
};

/** Canonical auth-channel policy read from public.system_settings with registry-compatible defaults. */
export async function isAuthChannelEnabled(db: DbPort, channel: AuthChannel): Promise<boolean> {
  try {
    const valueJson = await fetchPublicSystemSettingValueJson(
      db,
      SETTING_BY_CHANNEL[channel],
      'admin',
    );
    const inner = extractSystemSettingInnerValue(valueJson);
    return typeof inner === 'boolean' ? inner : DEFAULT_BY_CHANNEL[channel];
  } catch {
    return DEFAULT_BY_CHANNEL[channel];
  }
}
