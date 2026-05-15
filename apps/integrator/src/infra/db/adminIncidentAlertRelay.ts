import { createHash } from 'node:crypto';
import type { DbPort, DispatchPort, OutgoingIntent } from '../../kernel/contracts/index.js';
import { sendMaxMessage } from '../../integrations/max/client.js';
import { maxConfig } from '../../integrations/max/config.js';
import { getMaxApiKey } from '../../integrations/max/runtimeConfig.js';
import { logger } from '../observability/logger.js';

const ADMIN_INCIDENT_V1_TOPIC_KEYS = [
  'channel_link',
  'auto_merge_conflict',
  'auto_merge_conflict_anomaly',
  'messenger_phone_bind_blocked',
  'messenger_phone_bind_anomaly',
] as const;

type AdminIncidentTopicKey = (typeof ADMIN_INCIDENT_V1_TOPIC_KEYS)[number];

type AdminIncidentAlertChannels = { telegram: boolean; max: boolean };

type AdminIncidentAlertConfig = {
  topics: Record<AdminIncidentTopicKey, boolean>;
  channels: AdminIncidentAlertChannels;
};

const DEFAULT_TOPICS: Record<AdminIncidentTopicKey, boolean> = {
  channel_link: true,
  auto_merge_conflict: true,
  auto_merge_conflict_anomaly: true,
  messenger_phone_bind_blocked: true,
  messenger_phone_bind_anomaly: true,
};

function defaultConfig(): AdminIncidentAlertConfig {
  return {
    topics: { ...DEFAULT_TOPICS },
    channels: { telegram: true, max: true },
  };
}

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

/** Align with webapp admin incident alert JSON (unknown topic keys ignored). */
export function parseAdminIncidentAlertConfigIntegrator(valueJson: unknown): AdminIncidentAlertConfig {
  const out = defaultConfig();
  if (valueJson === null || valueJson === undefined) return out;
  let root: unknown = valueJson;
  if (typeof valueJson === 'object' && valueJson !== null && 'value' in (valueJson as Record<string, unknown>)) {
    root = (valueJson as Record<string, unknown>).value;
  }
  if (root === null || typeof root !== 'object') return out;
  const o = root as Record<string, unknown>;
  if (typeof o.topics === 'object' && o.topics !== null && !Array.isArray(o.topics)) {
    const t = o.topics as Record<string, unknown>;
    for (const k of ADMIN_INCIDENT_V1_TOPIC_KEYS) {
      if (k in t && isBool(t[k])) {
        out.topics[k] = t[k]!;
      }
    }
  }
  if (typeof o.channels === 'object' && o.channels !== null && !Array.isArray(o.channels)) {
    const c = o.channels as Record<string, unknown>;
    if (isBool(c.telegram)) out.channels.telegram = c.telegram;
    if (isBool(c.max)) out.channels.max = c.max;
  }
  return out;
}

function parseIdTokens(input: unknown): string[] {
  const fromArray = (items: unknown[]): string[] => {
    const out: string[] = [];
    for (const item of items) {
      const token = String(item).trim();
      if (!token) continue;
      if (!out.includes(token)) out.push(token);
    }
    return out;
  };

  if (Array.isArray(input)) {
    return fromArray(input);
  }

  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return fromArray(parsed);
    }
    if (typeof parsed === 'string') {
      return parseIdTokens(parsed);
    }
  } catch {
    // free-form
  }

  const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}

async function loadSettingInner(db: DbPort, key: string): Promise<unknown> {
  const r = await db.query<{ value_json: unknown }>(
    `SELECT value_json FROM public.system_settings WHERE key = $1 AND scope = 'admin' LIMIT 1`,
    [key],
  );
  const row = r.rows[0];
  if (!row) return null;
  const v = row.value_json;
  if (v !== null && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value;
  }
  return v;
}

async function loadAdminIdList(db: DbPort, key: 'admin_telegram_ids' | 'admin_max_ids'): Promise<string[]> {
  const inner = await loadSettingInner(db, key);
  return [...new Set(parseIdTokens(inner).map((x) => x.trim()).filter(Boolean))];
}

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

const MAX_LINE = 500;

export type MessengerPhoneBindIncidentTopic = 'messenger_phone_bind_blocked' | 'messenger_phone_bind_anomaly';

/**
 * Relay identity incident for messenger phone bind (integrator path), after durable audit + `insertedFirst`.
 */
export async function relayMessengerPhoneBindAdminIncident(input: {
  db: DbPort;
  getDispatchPort?: () => DispatchPort | undefined;
  topic: MessengerPhoneBindIncidentTopic;
  dedupKey: string;
  lines: string[];
}): Promise<void> {
  let cfg: AdminIncidentAlertConfig;
  try {
    const raw = await input.db.query<{ value_json: unknown }>(
      `SELECT value_json FROM public.system_settings WHERE key = 'admin_incident_alert_config' AND scope = 'admin' LIMIT 1`,
    );
    cfg = parseAdminIncidentAlertConfigIntegrator(raw.rows[0]?.value_json ?? null);
  } catch (err) {
    logger.warn({ err }, '[admin_incident] integrator: load admin_incident_alert_config failed, defaults');
    cfg = parseAdminIncidentAlertConfigIntegrator(null);
  }

  if (!cfg.topics[input.topic]) return;

  const dk = clip(input.dedupKey.replace(/[^a-zA-Z0-9:_-]/g, '_'), 120);
  const text = clip(input.lines.map((l) => clip(l, MAX_LINE)).join('\n'), 3900);
  if (!text.trim()) return;

  const dispatch = input.getDispatchPort?.();

  if (cfg.channels.telegram) {
    let telegramIds: string[] = [];
    try {
      telegramIds = await loadAdminIdList(input.db, 'admin_telegram_ids');
    } catch (err) {
      logger.warn({ err }, '[admin_incident] integrator: load admin_telegram_ids failed');
    }
    if (telegramIds.length === 0) {
      logger.info(
        { scope: 'admin_incident', event: 'admin_incident_alert_skipped_no_recipients', channel: 'telegram' },
        'skipped',
      );
    } else if (!dispatch) {
      logger.info(
        { scope: 'admin_incident', event: 'admin_incident_alert_skipped_no_dispatch', channel: 'telegram' },
        'skipped',
      );
    } else {
      for (const id of telegramIds) {
        const chatId = Number(id);
        if (!Number.isFinite(chatId)) continue;
        const eventId = clip(`admin-incident:${input.topic}:${dk}:telegram:${id}`, 240);
        const intent: OutgoingIntent = {
          type: 'message.send',
          meta: {
            eventId,
            occurredAt: new Date().toISOString(),
            source: 'telegram',
          },
          payload: {
            recipient: { chatId },
            message: { text },
            delivery: { channels: ['telegram'], maxAttempts: 1 },
          },
        };
        try {
          await dispatch.dispatchOutgoing(intent);
        } catch (err) {
          logger.warn(
            {
              err,
              scope: 'admin_incident',
              event: 'admin_incident_relay_failed',
              topic: input.topic,
              channel: 'telegram',
              recipient: id,
            },
            'relay failed',
          );
        }
      }
    }
  }

  if (cfg.channels.max && maxConfig.enabled) {
    let maxIds: string[] = [];
    try {
      maxIds = await loadAdminIdList(input.db, 'admin_max_ids');
    } catch (err) {
      logger.warn({ err }, '[admin_incident] integrator: load admin_max_ids failed');
    }
    if (maxIds.length === 0) {
      logger.info(
        { scope: 'admin_incident', event: 'admin_incident_alert_skipped_no_recipients', channel: 'max' },
        'skipped',
      );
    } else {
      const apiKey = await getMaxApiKey();
      if (!apiKey.trim()) {
        logger.info(
          { scope: 'admin_incident', event: 'admin_incident_alert_skipped_no_max_api_key', channel: 'max' },
          'skipped',
        );
      } else {
        const config = { apiKey };
        for (const id of maxIds) {
          const userId = Number(id);
          if (!Number.isFinite(userId)) continue;
          try {
            await sendMaxMessage(config, { userId, text });
          } catch (err) {
            logger.warn(
              {
                err,
                scope: 'admin_incident',
                event: 'admin_incident_relay_failed',
                topic: input.topic,
                channel: 'max',
                recipient: id,
              },
              'relay failed',
            );
          }
        }
      }
    }
  }
}

export function messengerPhoneBindDedupKey(input: {
  topic: MessengerPhoneBindIncidentTopic;
  conflictKey: string | null;
  reason: string;
  candidateIds: string[];
  details: Record<string, unknown>;
}): string {
  if (input.conflictKey && input.topic === 'messenger_phone_bind_blocked') {
    return input.conflictKey;
  }
  return createHash('sha256')
    .update(
      JSON.stringify({
        t: input.topic,
        r: input.reason,
        c: [...new Set(input.candidateIds.map((id) => id.trim()).filter(Boolean))].sort(),
        ch: input.details.channelCode,
        ex: input.details.externalId,
        co: input.details.correlationId,
      }),
    )
    .digest('hex');
}
