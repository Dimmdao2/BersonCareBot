import { createHash } from 'node:crypto';
import { logger } from '@/infra/logging/logger';
import { relayOperatorAlert } from './relayOperatorAlert';
import { getConfigValue } from '@/modules/system-settings/configAdapter';
import { getAdminNotificationTargetsPort } from './adminNotificationTargetsRuntime';
import { getAdminIncidentStaffPushDeps } from '@/modules/admin-incidents/adminIncidentStaffPushRuntime';
import { sendAdminIncidentStaffWebPush } from '@/modules/admin-incidents/sendAdminIncidentStaffWebPush';
import { ADMIN_INCIDENT_ALERT_CONFIG_KEY } from '@/modules/admin-incidents/adminIncidentAlertConfig';
import {
  isOperatorAlertBlockEnabled,
  mergeOperatorHealthAlertConfigFromLegacy,
  OPERATOR_HEALTH_ALERT_CONFIG_KEY,
  type OperatorAlertBlock,
  type OperatorHealthAlertConfig,
} from './operatorHealthAlertConfig';
import { getOperatorAlertDedupPort } from './operatorAlertRuntime';
import { reportEmptyAudience } from './emptyAudienceRuntime';

const MAX_LINE = 500;
const DEDUP_HOURS = 24;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function loadConfig(): Promise<OperatorHealthAlertConfig> {
  const [operatorRaw, legacyRaw] = await Promise.all([
    getConfigValue(OPERATOR_HEALTH_ALERT_CONFIG_KEY),
    getConfigValue(ADMIN_INCIDENT_ALERT_CONFIG_KEY),
  ]);
  const parseJson = (raw: string): unknown | null => {
    const t = raw.trim();
    if (!t) return null;
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return null;
    }
  };
  return mergeOperatorHealthAlertConfigFromLegacy(parseJson(operatorRaw), parseJson(legacyRaw));
}

/**
 * C-4 (2026-07-26, docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): recipients are resolved from WHO
 * ACTUALLY HOLDS THE ADMIN ROLE right now (`platform_users.role='admin'` joined to their bound
 * channels), never from the `admin_telegram_ids`/`admin_max_ids`/`admin_phones` DB-resident address
 * lists — those no longer confer any role either (envRole.ts) and are not read here anymore. A
 * failed DB read degrades to an empty audience (never throws): `dispatchOperatorAlert`'s own
 * empty-audience path already counts and alerts that on its own.
 */
async function loadAdminRelayTargets(): Promise<{
  telegram: string[];
  max: string[];
  sms: string[];
  email: string[];
}> {
  const port = getAdminNotificationTargetsPort();
  if (!port) return { telegram: [], max: [], sms: [], email: [] };
  try {
    return await port.loadTargets();
  } catch (err) {
    logger.warn(
      { err, scope: 'operator_alert' },
      '[operator_alert] load admin notification targets failed',
    );
    return { telegram: [], max: [], sms: [], email: [] };
  }
}

export type DispatchOperatorAlertInput = {
  /** Exact tenant for staff WebPush. Global health alerts omit it and do not synthesize a tenant. */
  organizationId?: string;
  block: OperatorAlertBlock;
  topic: string;
  dedupKey: string;
  /** Stable server-owned identity for an incident phase; survives claim retries/restarts. */
  deliveryIdentity?: string;
  lines: string[];
  pushTitle?: string;
  pushUrl?: string;
  /** Incident rows own cadence; do not consult/write the flat alert-sent dedup table. */
  deduplication?: 'default' | 'incident_cadence';
};

export type DispatchOperatorAlertResult = {
  dispatched: boolean;
  reason?: 'disabled' | 'dedup' | 'empty_text' | 'no_recipients';
};

async function fireOperatorRelay(input: {
  messageId: string;
  channel: 'telegram' | 'max' | 'sms' | 'email';
  recipient: string;
  recipientRef?: string;
  text: string;
  subject?: string;
  block: OperatorAlertBlock;
  topic: string;
}): Promise<boolean> {
  try {
    const result = await relayOperatorAlert({
      messageId: input.messageId,
      channel: input.channel,
      recipient: input.recipient,
      text: input.text,
      ...(input.subject ? { metadata: { subject: input.subject } } : {}),
    });
    if (result.ok) return result.status !== 'skipped';
    logger.warn(
      {
        scope: 'operator_alert',
        event: 'operator_alert_relay_failed',
        block: input.block,
        topic: input.topic,
        channel: input.channel,
        ...(input.recipientRef
          ? { recipientRef: input.recipientRef }
          : { recipient: input.recipient }),
        reason: result.reason,
      },
      'relay failed',
    );
    return false;
  } catch (err: unknown) {
    logger.warn(
      { err, block: input.block, topic: input.topic, channel: input.channel },
      'relay failed',
    );
    return false;
  }
}

/**
 * Единый диспетчер операторских алертов (TG / Max / staff Web Push / SMS / email).
 * Каналы изолированы; успех фиксируется только после accepted/duplicate хотя бы одного канала.
 */
export async function dispatchOperatorAlert(
  input: DispatchOperatorAlertInput,
): Promise<DispatchOperatorAlertResult> {
  const cfg = await loadConfig();
  if (!isOperatorAlertBlockEnabled(cfg, input.block)) {
    return { dispatched: false, reason: 'disabled' };
  }

  const dk = clip(input.dedupKey.replace(/[^a-zA-Z0-9:_-]/g, '_'), 120);
  const dedupPort = getOperatorAlertDedupPort();
  const usesFlatDedup = input.deduplication !== 'incident_cadence';
  if (dedupPort && usesFlatDedup) {
    const recent = await dedupPort.wasSentWithinHours(dk, DEDUP_HOURS);
    if (recent) return { dispatched: false, reason: 'dedup' };
  }

  const text = clip(input.lines.map((l) => clip(l, MAX_LINE)).join('\n'), 3900);
  if (!text.trim()) return { dispatched: false, reason: 'empty_text' };

  const channels = cfg.channels[input.block];
  const targets = await loadAdminRelayTargets();
  // Ports deployed before a newly added channel may omit that list; an absent
  // list is equivalent to an empty recipient audience for every relay channel.
  const telegramTargets = targets.telegram ?? [];
  const maxTargets = targets.max ?? [];
  const smsTargets = targets.sms ?? [];
  const emailTargets = targets.email ?? [];
  const pushTitle = input.pushTitle ?? input.topic;
  const pushBody = clip(input.lines.find((line) => line.trim().length > 0) ?? text, 160);
  const pushUrl = input.pushUrl ?? '/app/admin/technical';

  const attempts: Array<Promise<boolean>> = [];

  if (channels.telegram) {
    if (telegramTargets.length === 0) {
      logger.info({
        scope: 'operator_alert',
        event: 'operator_alert_skipped_no_recipients',
        channel: 'telegram',
      });
    } else {
      for (const id of telegramTargets) {
        const messageId = `operator-alert:${input.deliveryIdentity ?? dk}:telegram:${id}`;
        attempts.push(
          fireOperatorRelay({
            messageId,
            channel: 'telegram',
            recipient: id,
            recipientRef: `tg:…${id.slice(-4)}`,
            text,
            block: input.block,
            topic: input.topic,
          }),
        );
      }
    }
  }

  if (channels.max) {
    if (maxTargets.length === 0) {
      logger.info({
        scope: 'operator_alert',
        event: 'operator_alert_skipped_no_recipients',
        channel: 'max',
      });
    } else {
      for (const id of maxTargets) {
        const messageId = `operator-alert:${input.deliveryIdentity ?? dk}:max:${id}`;
        attempts.push(
          fireOperatorRelay({
            messageId,
            channel: 'max',
            recipient: id,
            recipientRef: `max:…${id.slice(-4)}`,
            text,
            block: input.block,
            topic: input.topic,
          }),
        );
      }
    }
  }

  if (channels.sms) {
    if (smsTargets.length === 0) {
      logger.info({
        scope: 'operator_alert',
        event: 'operator_alert_skipped_no_recipients',
        channel: 'sms',
      });
    } else {
      for (const phone of smsTargets) {
        const recipientDigest = createHash('sha256').update(phone).digest('hex').slice(0, 16);
        const messageId = `operator-alert:${input.deliveryIdentity ?? dk}:sms:${recipientDigest}`;
        // The signed integrator relay checks SMSC readiness and returns a no-op success
        // before adapter dispatch when the provider is not connected.
        attempts.push(
          fireOperatorRelay({
            messageId,
            channel: 'sms',
            recipient: phone,
            recipientRef: `sms:…${phone.slice(-4)}`,
            text,
            block: input.block,
            topic: input.topic,
          }),
        );
      }
    }
  }

  if (channels.email) {
    if (emailTargets.length === 0) {
      logger.info({
        scope: 'operator_alert',
        event: 'operator_alert_skipped_no_recipients',
        channel: 'email',
      });
    } else {
      for (const emailAddress of emailTargets) {
        const recipientDigest = createHash('sha256')
          .update(emailAddress)
          .digest('hex')
          .slice(0, 16);
        const messageId = `operator-alert:${input.deliveryIdentity ?? dk}:email:${recipientDigest}`;
        attempts.push(
          fireOperatorRelay({
            messageId,
            channel: 'email',
            recipient: emailAddress,
            recipientRef: `email:${recipientDigest}`,
            text,
            subject: pushTitle,
            block: input.block,
            topic: input.topic,
          }),
        );
      }
    }
  }

  if (channels.web_push) {
    const pushDeps = getAdminIncidentStaffPushDeps();
    if (!pushDeps) {
      logger.info({
        scope: 'operator_alert',
        event: 'operator_alert_skipped_no_push_runtime',
        channel: 'web_push',
      });
    } else {
      attempts.push(
        sendAdminIncidentStaffWebPush(
          {
            ...(input.organizationId ? { organizationId: input.organizationId } : {}),
            topic: input.topic,
            dedupKey: input.deliveryIdentity ?? dk,
            pushTitle,
            pushBody,
            pushUrl,
          },
          pushDeps,
        )
          .then((delivered) => {
            if (delivered > 0) return true;
            logger.info({
              scope: 'operator_alert',
              event: 'operator_alert_skipped_no_recipients',
              channel: 'web_push',
              block: input.block,
            });
            return false;
          })
          .catch((err: unknown) => {
            logger.warn(
              { err, block: input.block, topic: input.topic },
              'operator alert web push failed',
            );
            return false;
          }),
      );
    }
  }

  const anyChannelAttempted = (await Promise.all(attempts)).some(Boolean);

  if (dedupPort && usesFlatDedup && anyChannelAttempted) {
    await dedupPort.recordSent({ dedupKey: dk, severity: input.block });
  }

  if (!anyChannelAttempted) {
    // D-b: сам диспетчер алертов не имеет права молча вернуть «некому». Это корневой
    // маршрут (mandatory top-level route у Alertmanager, «Default Policy can't be deleted»
    // у Grafana): пусто → считаем, логируем и уводим в env-fallback, который из админки
    // не отключается. Рекурсии нет: репортер не зовёт `dispatchOperatorAlert`.
    await reportEmptyAudience({
      topic: `operator_alert:${input.topic}`,
      severity: 'operational',
      channels: Object.entries(channels)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
      context: { block: input.block },
    });
  }

  return {
    dispatched: anyChannelAttempted,
    reason: anyChannelAttempted ? undefined : 'no_recipients',
  };
}
