import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  extractSystemSettingInnerValue,
  fetchIntegratorRuntimeSettingValueJson,
} from '../db/publicSystemSettings.js';
import { runIntegratorSql } from '../db/runIntegratorSql.js';
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
    if (typeof o.topics.critical_enabled === 'boolean')
      out.topics.critical_enabled = o.topics.critical_enabled;
    if (typeof o.topics.digest_enabled === 'boolean')
      out.topics.digest_enabled = o.topics.digest_enabled;
    if (typeof o.topics.account_conflicts === 'boolean')
      out.topics.account_conflicts = o.topics.account_conflicts;
  }
  const mergeBlock = (
    block: keyof OperatorHealthAlertConfigIntegrator['channels'],
    raw: unknown,
  ) => {
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
  out.topics.critical_enabled =
    topics.system_health_db_guard === true || out.topics.critical_enabled;
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
  const operatorJson = await fetchIntegratorRuntimeSettingValueJson(db, 'operator_health_alert_config');
  const operatorParsed = parseOperatorConfig(operatorJson);
  if (operatorParsed) return operatorParsed;
  const legacyJson = await fetchIntegratorRuntimeSettingValueJson(db, 'admin_incident_alert_config');
  return parseLegacyConfig(legacyJson);
}

type AdminNotificationTargetRow = { channel_code: string | null; external_id: string | null };

/**
 * C-4 (2026-07-26, docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md, webapp repo): recipients are resolved
 * from WHO ACTUALLY HOLDS THE ADMIN ROLE right now (`platform_users.role='admin'` joined to their
 * bound messenger channels), never from the `admin_telegram_ids`/`admin_max_ids` DB-resident address
 * lists — those no longer confer any role either (webapp `envRole.ts`) and are not read here
 * anymore. Mirrors `apps/webapp/src/infra/repos/pgAdminNotificationTargets.ts`; kept as a separate
 * query here because the integrator's DB access goes through `DbPort`/`runIntegratorSql`, not the
 * webapp's Drizzle pool. The integrator's login role already has SELECT on both tables
 * (`deploy/postgres/integrator-login-public-identity-grants.sql`) — no new grant needed.
 */
export async function loadAdminMessengerIdLists(
  db: DbPort,
): Promise<{ telegram: string[]; max: string[] }> {
  const res = await runIntegratorSql<AdminNotificationTargetRow>(
    db,
    sql`SELECT ucb.channel_code, ucb.external_id
          FROM public.platform_users pu
          JOIN public.user_channel_bindings ucb
            ON ucb.user_id = pu.id AND ucb.channel_code IN ('telegram', 'max')
         WHERE pu.role = 'admin'
           AND pu.merged_into_id IS NULL
           AND pu.is_archived = FALSE`,
  );
  const telegram = new Set<string>();
  const max = new Set<string>();
  for (const row of res.rows) {
    const id = row.external_id?.trim();
    if (!id) continue;
    if (row.channel_code === 'telegram') telegram.add(id);
    if (row.channel_code === 'max') max.add(id);
  }
  return { telegram: [...telegram], max: [...max] };
}
