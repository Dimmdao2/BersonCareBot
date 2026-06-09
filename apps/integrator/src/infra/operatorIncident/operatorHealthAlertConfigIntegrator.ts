import { z } from 'zod';
import {
  extractSystemSettingInnerValue,
  fetchPublicSystemSettingValueJson,
} from '../db/publicSystemSettings.js';
import { parseMessengerIdTokens } from '../db/parseMessengerIdTokens.js';
import type { DbPort } from '../../kernel/contracts/index.js';

const DEFAULT_CHANNELS = { telegram: true, max: true, web_push: true };

const LEGACY_IDENTITY_TOPICS = [
  'channel_link',
  'auto_merge_conflict',
  'auto_merge_conflict_anomaly',
  'messenger_phone_bind_blocked',
  'messenger_phone_bind_anomaly',
] as const;

type OperatorAlertChannels = { telegram: boolean; max: boolean; web_push: boolean };

export type OperatorHealthAlertConfigIntegrator = {
  topics: {
    critical_enabled: boolean;
    digest_enabled: boolean;
    account_conflicts: boolean;
  };
  channels: {
    critical: OperatorAlertChannels;
    digest: OperatorAlertChannels;
    account_conflicts: OperatorAlertChannels;
  };
};

const legacyConfigSchema = z
  .object({
    topics: z.record(z.string(), z.unknown()).optional(),
    channels: z
      .object({
        telegram: z.boolean().optional(),
        max: z.boolean().optional(),
        web_push: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();

const operatorConfigSchema = z
  .object({
    topics: z
      .object({
        critical_enabled: z.boolean().optional(),
        digest_enabled: z.boolean().optional(),
        account_conflicts: z.boolean().optional(),
      })
      .optional(),
    channels: z
      .object({
        critical: z
          .object({
            telegram: z.boolean().optional(),
            max: z.boolean().optional(),
            web_push: z.boolean().optional(),
          })
          .optional(),
        digest: z
          .object({
            telegram: z.boolean().optional(),
            max: z.boolean().optional(),
            web_push: z.boolean().optional(),
          })
          .optional(),
        account_conflicts: z
          .object({
            telegram: z.boolean().optional(),
            max: z.boolean().optional(),
            web_push: z.boolean().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

function defaultConfig(): OperatorHealthAlertConfigIntegrator {
  return {
    topics: {
      critical_enabled: true,
      digest_enabled: true,
      account_conflicts: true,
    },
    channels: {
      critical: { ...DEFAULT_CHANNELS },
      digest: { ...DEFAULT_CHANNELS },
      account_conflicts: { ...DEFAULT_CHANNELS },
    },
  };
}

function parseOperatorConfig(valueJson: unknown): OperatorHealthAlertConfigIntegrator | null {
  const inner = extractSystemSettingInnerValue(valueJson);
  const root = inner === undefined ? valueJson : inner;
  const parsed = operatorConfigSchema.safeParse(root);
  if (!parsed.success) return null;
  const out = defaultConfig();
  const o = parsed.data;
  if (o.topics) {
    if (typeof o.topics.critical_enabled === 'boolean') out.topics.critical_enabled = o.topics.critical_enabled;
    if (typeof o.topics.digest_enabled === 'boolean') out.topics.digest_enabled = o.topics.digest_enabled;
    if (typeof o.topics.account_conflicts === 'boolean') out.topics.account_conflicts = o.topics.account_conflicts;
  }
  const mergeBlock = (block: keyof OperatorHealthAlertConfigIntegrator['channels'], raw: unknown) => {
    const p = z
      .object({
        telegram: z.boolean().optional(),
        max: z.boolean().optional(),
        web_push: z.boolean().optional(),
      })
      .safeParse(raw);
    if (!p.success) return;
    if (typeof p.data.telegram === 'boolean') out.channels[block].telegram = p.data.telegram;
    if (typeof p.data.max === 'boolean') out.channels[block].max = p.data.max;
    if (typeof p.data.web_push === 'boolean') out.channels[block].web_push = p.data.web_push;
  };
  if (o.channels) {
    mergeBlock('critical', o.channels.critical);
    mergeBlock('digest', o.channels.digest);
    mergeBlock('account_conflicts', o.channels.account_conflicts);
  }
  return out;
}

function parseLegacyConfig(valueJson: unknown): OperatorHealthAlertConfigIntegrator {
  const out = defaultConfig();
  const inner = extractSystemSettingInnerValue(valueJson);
  const root = inner === undefined ? valueJson : inner;
  const parsed = legacyConfigSchema.safeParse(root);
  if (!parsed.success) return out;
  const topics = parsed.data.topics ?? {};
  out.topics.account_conflicts = LEGACY_IDENTITY_TOPICS.some((k) => topics[k] === true);
  out.topics.critical_enabled = topics.system_health_db_guard === true || out.topics.critical_enabled;
  const ch = parsed.data.channels;
  if (ch) {
    out.channels.account_conflicts = {
      telegram: typeof ch.telegram === 'boolean' ? ch.telegram : true,
      max: typeof ch.max === 'boolean' ? ch.max : true,
      web_push: typeof ch.web_push === 'boolean' ? ch.web_push : true,
    };
  }
  return out;
}

export async function loadOperatorHealthAlertConfigIntegrator(
  db: DbPort,
): Promise<OperatorHealthAlertConfigIntegrator> {
  const operatorJson = await fetchPublicSystemSettingValueJson(db, 'operator_health_alert_config');
  const operatorParsed = parseOperatorConfig(operatorJson);
  if (operatorParsed) return operatorParsed;
  const legacyJson = await fetchPublicSystemSettingValueJson(db, 'admin_incident_alert_config');
  return parseLegacyConfig(legacyJson);
}

export async function loadAdminMessengerIdLists(
  db: DbPort,
): Promise<{ telegram: string[]; max: string[] }> {
  const [tgInner, maxInner] = await Promise.all([
    fetchPublicSystemSettingValueJson(db, 'admin_telegram_ids').then((v) =>
      extractSystemSettingInnerValue(v ?? null) ?? v,
    ),
    fetchPublicSystemSettingValueJson(db, 'admin_max_ids').then((v) =>
      extractSystemSettingInnerValue(v ?? null) ?? v,
    ),
  ]);
  const dedupe = (ids: string[]) => [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  return {
    telegram: dedupe(parseMessengerIdTokens(tgInner)),
    max: dedupe(parseMessengerIdTokens(maxInner)),
  };
}
