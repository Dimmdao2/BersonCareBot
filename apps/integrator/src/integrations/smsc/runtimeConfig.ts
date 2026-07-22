import type { DbPort } from '../../kernel/contracts/index.js';
import {
  fetchPublicSystemSettingValueJson,
  parseSystemSettingStringValue,
  parseSystemSettingTrueLiteral,
} from '../../infra/db/publicSystemSettings.js';

export type SmscRuntimeConfig = { enabled: boolean; apiKey: string };

/** Canonical, global SMSC config. Any missing/invalid/failed read disables provider delivery. */
export async function getSmscRuntimeConfig(db: DbPort): Promise<SmscRuntimeConfig> {
  try {
    const [enabledValue, apiKeyValue] = await Promise.all([
      fetchPublicSystemSettingValueJson(db, 'smsc_enabled', 'admin'),
      fetchPublicSystemSettingValueJson(db, 'smsc_api_key', 'admin'),
    ]);
    return {
      enabled: enabledValue !== null && parseSystemSettingTrueLiteral(enabledValue),
      apiKey: apiKeyValue === null ? '' : (parseSystemSettingStringValue(apiKeyValue) ?? ''),
    };
  } catch {
    return { enabled: false, apiKey: '' };
  }
}

export async function getSmscApiKey(db: DbPort): Promise<string> {
  const config = await getSmscRuntimeConfig(db);
  return config.enabled ? config.apiKey : '';
}

export async function isSmscProviderReady(db: DbPort): Promise<boolean> {
  const config = await getSmscRuntimeConfig(db);
  return config.enabled && config.apiKey.length > 0;
}
