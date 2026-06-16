import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DbPort, DispatchPort, OutgoingIntent } from '../../kernel/contracts/index.js';
import { logger } from '../observability/logger.js';
import { extractSystemSettingInnerValue } from './publicSystemSettings.js';
import {
  loadAdminMessengerIdLists,
  loadOperatorHealthAlertConfigIntegrator,
} from '../operatorIncident/operatorHealthAlertConfigIntegrator.js';

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

const adminIncidentAlertConfigInnerSchema = z
  .object({
    topics: z.record(z.string(), z.unknown()).optional(),
    channels: z
      .object({
        telegram: z.boolean().optional(),
        max: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();

function defaultConfig(): AdminIncidentAlertConfig {
  return {
    topics: { ...DEFAULT_TOPICS },
    channels: { telegram: true, max: true },
  };
}

/** Align with webapp admin incident alert JSON (unknown topic keys ignored). */
export function parseAdminIncidentAlertConfigIntegrator(valueJson: unknown): AdminIncidentAlertConfig {
  const out = defaultConfig();
  const inner = extractSystemSettingInnerValue(valueJson);
  const root = inner === undefined ? valueJson : inner;
  const parsed = adminIncidentAlertConfigInnerSchema.safeParse(root);
  if (!parsed.success) return out;

  const o = parsed.data;
  if (o.topics) {
    for (const k of ADMIN_INCIDENT_V1_TOPIC_KEYS) {
      const topicVal = o.topics[k];
      const topicParsed = z.boolean().safeParse(topicVal);
      if (topicParsed.success) {
        out.topics[k] = topicParsed.data;
      }
    }
  }
  if (o.channels) {
    const tg = z.boolean().safeParse(o.channels.telegram);
    if (tg.success) out.channels.telegram = tg.data;
    const mx = z.boolean().safeParse(o.channels.max);
    if (mx.success) out.channels.max = mx.data;
  }
  return out;
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
  let operatorCfg;
  try {
    operatorCfg = await loadOperatorHealthAlertConfigIntegrator(input.db);
  } catch (err) {
    logger.warn({ err }, '[admin_incident] integrator: load operator_health_alert_config failed');
    return;
  }

  if (!operatorCfg.topics.account_conflicts) return;

  const channels = operatorCfg.channels.account_conflicts;

  const dk = clip(input.dedupKey.replace(/[^a-zA-Z0-9:_-]/g, '_'), 120);
  const text = clip(input.lines.map((l) => clip(l, MAX_LINE)).join('\n'), 3900);
  if (!text.trim()) return;

  const dispatch = input.getDispatchPort?.();

  if (channels.telegram) {
    let telegramIds: string[] = [];
    try {
      const lists = await loadAdminMessengerIdLists(input.db);
      telegramIds = lists.telegram;
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

  if (channels.max) {
    let maxIds: string[] = [];
    try {
      const lists = await loadAdminMessengerIdLists(input.db);
      maxIds = lists.max;
    } catch (err) {
      logger.warn({ err }, '[admin_incident] integrator: load admin_max_ids failed');
    }
    if (maxIds.length === 0) {
      logger.info(
        { scope: 'admin_incident', event: 'admin_incident_alert_skipped_no_recipients', channel: 'max' },
        'skipped',
      );
    } else if (!dispatch) {
      logger.info(
        { scope: 'admin_incident', event: 'admin_incident_alert_skipped_no_dispatch', channel: 'max' },
        'skipped',
      );
    } else {
      for (const id of maxIds) {
        const userId = Number(id);
        if (!Number.isFinite(userId)) continue;
        const eventId = clip(`admin-incident:${input.topic}:${dk}:max:${id}`, 240);
        const intent: OutgoingIntent = {
          type: 'message.send',
          meta: {
            eventId,
            occurredAt: new Date().toISOString(),
            source: 'max',
          },
          payload: {
            recipient: { userId },
            message: { text },
            delivery: { channels: ['max'], maxAttempts: 1 },
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
