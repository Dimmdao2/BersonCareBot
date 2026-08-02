import { z } from 'zod';
import { createDbPort } from '../db/client.js';
import type { DbPort } from '../../kernel/contracts/index.js';
import {
  fetchIntegratorProviderRuntimeSettingValueJson,
  type IntegratorProviderRuntimeSettingKey,
  parseSystemSettingStringValue,
  parseSystemSettingTrueLiteral,
} from '../db/publicSystemSettings.js';
import { runWithBootstrapPrincipal } from '../principal/organizationPrincipal.js';

export type TelegramRuntimeConfig = {
  enabled: boolean;
  botToken: string;
  webhookSecret: string;
  sendMenuOnButtonPress: boolean;
};
export type MaxRuntimeConfig = {
  enabled: boolean;
  apiKey: string;
  webhookSecret: string;
  baseUrl: string;
};
export type SmscRuntimeConfig = { enabled: boolean; apiKey: string; baseUrl: string };

const value = async (db: DbPort, key: IntegratorProviderRuntimeSettingKey): Promise<string> => {
  const raw = await fetchIntegratorProviderRuntimeSettingValueJson(db, key);
  return raw === null ? '' : (parseSystemSettingStringValue(raw) ?? '');
};
const url = (input: string): string => (z.string().url().safeParse(input).success ? input : '');

/** The single DB-backed runtime accessor for platform provider configuration. */
export async function readTelegramRuntimeConfig(db: DbPort): Promise<TelegramRuntimeConfig> {
  try {
    const [botToken, webhookSecret, menu] = await runWithBootstrapPrincipal(
      { source: 'integrator-server-runtime-config' },
      () =>
        Promise.all([
          value(db, 'telegram_bot_token'),
          value(db, 'telegram_webhook_secret'),
          fetchIntegratorProviderRuntimeSettingValueJson(db, 'telegram_send_menu_on_button_press'),
        ]),
    );
    return {
      enabled: Boolean(botToken && webhookSecret),
      botToken,
      webhookSecret,
      sendMenuOnButtonPress: menu !== null && parseSystemSettingTrueLiteral(menu),
    };
  } catch {
    return { enabled: false, botToken: '', webhookSecret: '', sendMenuOnButtonPress: false };
  }
}
export function getTelegramRuntimeConfig(): Promise<TelegramRuntimeConfig> {
  return readTelegramRuntimeConfig(createDbPort());
}

export async function readMaxRuntimeConfig(db: DbPort): Promise<MaxRuntimeConfig> {
  try {
    const [apiKey, webhookSecret, baseUrlRaw] = await runWithBootstrapPrincipal(
      { source: 'integrator-server-runtime-config' },
      () =>
        Promise.all([
          value(db, 'max_bot_api_key'),
          value(db, 'max_webhook_secret'),
          value(db, 'max_api_base_url'),
        ]),
    );
    const baseUrl = url(baseUrlRaw);
    return { enabled: Boolean(apiKey && webhookSecret && baseUrl), apiKey, webhookSecret, baseUrl };
  } catch {
    return { enabled: false, apiKey: '', webhookSecret: '', baseUrl: '' };
  }
}
export function getMaxRuntimeConfig(): Promise<MaxRuntimeConfig> {
  return readMaxRuntimeConfig(createDbPort());
}

export async function readSmscRuntimeConfig(db: DbPort): Promise<SmscRuntimeConfig> {
  try {
    const [enabledValue, apiKey, baseUrlRaw] = await runWithBootstrapPrincipal(
      { source: 'integrator-server-runtime-config' },
      () =>
        Promise.all([
          fetchIntegratorProviderRuntimeSettingValueJson(db, 'smsc_enabled'),
          value(db, 'smsc_api_key'),
          value(db, 'smsc_base_url'),
        ]),
    );
    const baseUrl = url(baseUrlRaw);
    const enabled =
      enabledValue !== null &&
      parseSystemSettingTrueLiteral(enabledValue) &&
      Boolean(apiKey && baseUrl);
    return { enabled, apiKey, baseUrl };
  } catch {
    return { enabled: false, apiKey: '', baseUrl: '' };
  }
}
export function getSmscRuntimeConfig(): Promise<SmscRuntimeConfig> {
  return readSmscRuntimeConfig(createDbPort());
}
