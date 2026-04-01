import {
  getAdminSettingString,
  resetAdminRuntimeConfigCache,
} from '../../infra/db/repos/adminRuntimeConfig.js';
import { rubitimeConfig } from './config.js';

export function resetRubitimeRuntimeConfigCache(): void {
  resetAdminRuntimeConfigCache();
}

export async function getRubitimeApiKey(): Promise<string> {
  return getAdminSettingString('rubitime_api_key', rubitimeConfig.apiKey);
}

export async function getRubitimeWebhookToken(): Promise<string> {
  return getAdminSettingString('rubitime_webhook_token', rubitimeConfig.webhookToken);
}

export async function getRubitimeScheduleMappingRaw(): Promise<string> {
  const fallback = process.env.RUBITIME_SCHEDULE_MAPPING?.trim() ?? '';
  return getAdminSettingString('rubitime_schedule_mapping', fallback);
}
