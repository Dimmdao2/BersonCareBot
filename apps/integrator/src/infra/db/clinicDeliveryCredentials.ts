import type { DbPort } from '../../kernel/contracts/index.js';
import {
  parseSmtpOutboundValueJson,
  type ResolvedSmtpOutboundConfig,
} from '../../config/smtpOutbound.js';
import {
  readExactOrganizationPublicSystemSettingString,
  readExactOrganizationPublicSystemSettingValueJson,
} from './publicSystemSettings.js';
import { getCurrentOrganizationPrincipalId } from '../principal/organizationPrincipal.js';
import { resolveOrganizationMechanicLifecycleAccess } from './organizationMechanicLifecycleDoor.js';

export type ClinicDeliveryChannel = 'email' | 'smsc' | 'telegram' | 'max';
export type ClinicDeliveryCredential =
  | { channel: 'email'; smtp: ResolvedSmtpOutboundConfig }
  | { channel: 'smsc'; apiKey: string }
  | { channel: 'telegram'; botToken: string }
  | { channel: 'max'; apiKey: string };

const SETTINGS: Record<ClinicDeliveryChannel, { key: string; mechanic: string }> = {
  email: { key: 'clinic_smtp_outbound', mechanic: 'clinic_smtp' },
  smsc: { key: 'clinic_smsc_api_key', mechanic: 'clinic_sms' },
  telegram: { key: 'clinic_telegram_bot_token', mechanic: 'clinic_telegram_bot' },
  max: { key: 'clinic_max_bot_api_key', mechanic: 'clinic_max_bot' },
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
      if (channel === 'email') {
        const valueJson = await readExactOrganizationPublicSystemSettingValueJson(
          db,
          setting.key,
          organizationId,
        );
        const smtp = valueJson === null ? null : parseSmtpOutboundValueJson(valueJson);
        return smtp?.configured ? { channel, smtp } : null;
      }
      const value = await readExactOrganizationPublicSystemSettingString(
        db,
        setting.key,
        organizationId,
      );
      if (!value) return null;
      if (channel === 'smsc') return { channel, apiKey: value };
      if (channel === 'telegram') return { channel, botToken: value };
      return { channel, apiKey: value };
    } catch {
      return null;
    }
  };
}
