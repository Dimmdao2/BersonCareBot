import { getAdminSettingString } from '../../infra/db/repos/adminRuntimeConfig.js';
import { smscConfig } from './config.js';

export async function getSmscApiKey(): Promise<string> {
  return getAdminSettingString('smsc_api_key', smscConfig.apiKey);
}
