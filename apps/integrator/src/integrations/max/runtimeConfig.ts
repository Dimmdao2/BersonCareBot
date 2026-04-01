import { getAdminSettingString } from '../../infra/db/repos/adminRuntimeConfig.js';
import { maxConfig } from './config.js';

export async function getMaxApiKey(): Promise<string> {
  return getAdminSettingString('max_api_key', maxConfig.apiKey);
}

export async function getMaxWebhookSecret(): Promise<string> {
  return getAdminSettingString('max_webhook_secret', maxConfig.webhookSecret);
}
