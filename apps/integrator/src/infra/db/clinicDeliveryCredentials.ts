import type { DbPort } from '../../kernel/contracts/index.js';
import {
  parseSmtpOutboundValueJson,
  type ResolvedSmtpOutboundConfig,
} from '../../config/smtpOutbound.js';
import {
  fetchIntegratorClinicDeliveryCredentialValueJson,
  type IntegratorClinicDeliveryCredentialKey,
  parseSystemSettingStringValue,
} from './publicSystemSettings.js';
import { getCurrentOrganizationPrincipalId } from '../principal/organizationPrincipal.js';
import { resolveOrganizationMechanicLifecycleAccess } from './organizationMechanicLifecycleDoor.js';

export type ClinicDeliveryChannel = 'email' | 'smsc' | 'telegram' | 'max' | 'vk';
export type ClinicDeliveryCredential =
  | { channel: 'email'; smtp: ResolvedSmtpOutboundConfig }
  | { channel: 'smsc'; apiKey: string }
  | { channel: 'telegram'; botToken: string }
  | { channel: 'max'; apiKey: string }
  | { channel: 'vk'; accessToken: string };

const SETTINGS: Record<
  ClinicDeliveryChannel,
  { key: IntegratorClinicDeliveryCredentialKey; mechanic: string }
> = {
  email: { key: 'clinic_smtp_outbound', mechanic: 'clinic_smtp' },
  smsc: { key: 'clinic_smsc_api_key', mechanic: 'clinic_sms' },
  telegram: { key: 'clinic_telegram_bot_token', mechanic: 'clinic_telegram_bot' },
  max: { key: 'clinic_max_bot_api_key', mechanic: 'clinic_max_bot' },
  vk: { key: 'clinic_vk_community_access_token', mechanic: 'clinic_vk_community' },
};

function exactCurrentOrganization(): string | null {
  const organizationId = getCurrentOrganizationPrincipalId()?.trim() ?? '';
  return organizationId || null;
}

/**
 * Reads only an exact current-org credential. A missing principal, disabled tariff mechanic or
 * malformed value returns null; callers decide whether platform fallback is allowed.
 */
export function createClinicDeliveryCredentialResolver(db: DbPort) {
  return async function resolveClinicDeliveryCredential(
    channel: ClinicDeliveryChannel,
  ): Promise<ClinicDeliveryCredential | null> {
    const organizationId = exactCurrentOrganization();
    if (!organizationId) return null;
    const setting = SETTINGS[channel];
    try {
      const access = await resolveOrganizationMechanicLifecycleAccess(db, {
        organizationId,
        mechanic: setting.mechanic,
      });
      if (!access.mutationAllowed) return null;
      const valueJson = await fetchIntegratorClinicDeliveryCredentialValueJson(
        db,
        setting.key,
        organizationId,
      );
      if (channel === 'email') {
        const smtp = valueJson === null ? null : parseSmtpOutboundValueJson(valueJson);
        return smtp?.configured ? { channel, smtp } : null;
      }
      const value = valueJson === null ? null : parseSystemSettingStringValue(valueJson);
      if (!value) return null;
      if (channel === 'smsc') return { channel, apiKey: value };
      if (channel === 'telegram') return { channel, botToken: value };
      if (channel === 'vk') return { channel, accessToken: value };
      return { channel, apiKey: value };
    } catch {
      return null;
    }
  };
}
