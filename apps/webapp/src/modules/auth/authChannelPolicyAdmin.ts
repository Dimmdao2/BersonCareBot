import { getConfigValue } from '@/modules/system-settings/configAdapter';
import {
  getMaxBotApiKey,
  getTelegramBotToken,
} from '@/modules/system-settings/integrationRuntime';
import { smtpInnerFromValueJson } from '@/modules/system-settings/smtpOutboundPatch';
import { isAuthChannelEnabled, type AuthChannel } from './authChannelPolicy';

export type AuthChannelDetail = Readonly<{ enabled: boolean; configured: boolean }>;
export type AuthChannelPolicyDetail = Readonly<Record<AuthChannel, AuthChannelDetail>>;

async function isSmtpConfigured(): Promise<boolean> {
  const raw = await getConfigValue('smtp_outbound');
  if (!raw.trim()) return false;
  try {
    return smtpInnerFromValueJson(JSON.parse(raw)).success === true;
  } catch {
    return false;
  }
}

async function isSmsProviderConfigured(): Promise<boolean> {
  return (await getConfigValue('smsc_api_key')).trim().length > 0;
}

async function isTelegramBotConfigured(): Promise<boolean> {
  return (await getTelegramBotToken()).trim().length > 0;
}

async function isMaxBotConfigured(): Promise<boolean> {
  return (await getMaxBotApiKey()).trim().length > 0;
}

async function isChannelConfigured(channel: AuthChannel): Promise<boolean> {
  if (channel === 'email') return isSmtpConfigured();
  if (channel === 'sms') return isSmsProviderConfigured();
  if (channel === 'telegram') return isTelegramBotConfigured();
  return isMaxBotConfigured();
}

/** Credential-backed detail for the authenticated platform settings route only. */
export async function getAuthChannelPolicyDetail(): Promise<AuthChannelPolicyDetail> {
  const channels: readonly AuthChannel[] = ['email', 'sms', 'telegram', 'max'];
  const entries = await Promise.all(
    channels.map(async (channel) => {
      const [enabled, configured] = await Promise.all([
        isAuthChannelEnabled(channel),
        isChannelConfigured(channel),
      ]);
      return [channel, { enabled, configured }] as const;
    }),
  );
  return Object.fromEntries(entries) as AuthChannelPolicyDetail;
}
