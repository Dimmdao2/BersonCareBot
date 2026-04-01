import { maxConfig } from './config.js';

export async function getMaxApiKey(): Promise<string> {
  return maxConfig.apiKey;
}

export async function getMaxWebhookSecret(): Promise<string> {
  return maxConfig.webhookSecret;
}
