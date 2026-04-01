import { smscConfig } from './config.js';

export async function getSmscApiKey(): Promise<string> {
  return smscConfig.apiKey;
}
