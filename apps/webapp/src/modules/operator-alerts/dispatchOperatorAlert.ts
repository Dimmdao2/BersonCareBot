import { logger } from "@/infra/logging/logger";
import { relayOutbound } from "@/modules/messaging/relayOutbound";
import { getConfigValue } from "@/modules/system-settings/configAdapter";
import { parseIdTokens } from "@/shared/parsers/parseIdTokens";
import { getAdminIncidentStaffPushDeps } from "@/modules/admin-incidents/adminIncidentStaffPushRuntime";
import { sendAdminIncidentStaffWebPush } from "@/modules/admin-incidents/sendAdminIncidentStaffWebPush";
import { ADMIN_INCIDENT_ALERT_CONFIG_KEY } from "@/modules/admin-incidents/adminIncidentAlertConfig";
import {
  isOperatorAlertBlockEnabled,
  mergeOperatorHealthAlertConfigFromLegacy,
  OPERATOR_HEALTH_ALERT_CONFIG_KEY,
  type OperatorAlertBlock,
  type OperatorHealthAlertConfig,
} from "./operatorHealthAlertConfig";
import { getOperatorAlertDedupPort } from "./operatorAlertRuntime";

const MAX_LINE = 500;
const DEDUP_HOURS = 24;

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
}

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function loadConfig(): Promise<OperatorHealthAlertConfig> {
  try {
    const [operatorRaw, legacyRaw] = await Promise.all([
      getConfigValue(OPERATOR_HEALTH_ALERT_CONFIG_KEY, ""),
      getConfigValue(ADMIN_INCIDENT_ALERT_CONFIG_KEY, ""),
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
  } catch (err) {
    logger.warn({ err }, "[operator_alert] load config failed, using defaults");
    return mergeOperatorHealthAlertConfigFromLegacy(null, null);
  }
}

async function loadAdminRelayTargets(): Promise<{ telegram: string[]; max: string[] }> {
  const [adminTg, adminMax] = await Promise.all([
    getConfigValue("admin_telegram_ids", ""),
    getConfigValue("admin_max_ids", ""),
  ]);
  return {
    telegram: dedupe(parseIdTokens(adminTg)),
    max: dedupe(parseIdTokens(adminMax)),
  };
}

export type DispatchOperatorAlertInput = {
  block: OperatorAlertBlock;
  topic: string;
  dedupKey: string;
  lines: string[];
  pushTitle?: string;
  pushUrl?: string;
};

export type DispatchOperatorAlertResult = {
  dispatched: boolean;
  reason?: "disabled" | "dedup" | "empty_text" | "no_recipients";
};

/**
 * Единый диспетчер операторских алертов (TG / Max / staff Web Push).
 * Fire-and-forget для каналов; dedup — 24 ч по `dedup_key`.
 */
export async function dispatchOperatorAlert(input: DispatchOperatorAlertInput): Promise<DispatchOperatorAlertResult> {
  const cfg = await loadConfig();
  if (!isOperatorAlertBlockEnabled(cfg, input.block)) {
    return { dispatched: false, reason: "disabled" };
  }

  const dk = clip(input.dedupKey.replace(/[^a-zA-Z0-9:_-]/g, "_"), 120);
  const dedupPort = getOperatorAlertDedupPort();
  if (dedupPort) {
    const recent = await dedupPort.wasSentWithinHours(dk, DEDUP_HOURS);
    if (recent) return { dispatched: false, reason: "dedup" };
  }

  const text = clip(input.lines.map((l) => clip(l, MAX_LINE)).join("\n"), 3900);
  if (!text.trim()) return { dispatched: false, reason: "empty_text" };

  const channels = cfg.channels[input.block];
  const targets = await loadAdminRelayTargets();
  const pushTitle = input.pushTitle ?? input.topic;
  const pushBody = clip(input.lines.find((line) => line.trim().length > 0) ?? text, 160);
  const pushUrl = input.pushUrl ?? "/app/doctor/admin/technical";

  let anyChannelAttempted = false;

  if (channels.telegram) {
    if (targets.telegram.length === 0) {
      logger.info({ scope: "operator_alert", event: "operator_alert_skipped_no_recipients", channel: "telegram" });
    } else {
      anyChannelAttempted = true;
      for (const id of targets.telegram) {
        const messageId = `operator-alert:${input.block}:${input.topic}:${dk}:telegram:${id}`;
        void relayOutbound({ messageId, channel: "telegram", recipient: id, text }).then((r) => {
          if (!r.ok) {
            logger.warn(
              {
                scope: "operator_alert",
                event: "operator_alert_relay_failed",
                block: input.block,
                topic: input.topic,
                channel: "telegram",
                recipient: id,
                reason: r.reason,
              },
              "relay failed",
            );
          }
        });
      }
    }
  }

  if (channels.max) {
    if (targets.max.length === 0) {
      logger.info({ scope: "operator_alert", event: "operator_alert_skipped_no_recipients", channel: "max" });
    } else {
      anyChannelAttempted = true;
      for (const id of targets.max) {
        const messageId = `operator-alert:${input.block}:${input.topic}:${dk}:max:${id}`;
        void relayOutbound({ messageId, channel: "max", recipient: id, text }).then((r) => {
          if (!r.ok) {
            logger.warn(
              {
                scope: "operator_alert",
                event: "operator_alert_relay_failed",
                block: input.block,
                topic: input.topic,
                channel: "max",
                recipient: id,
                reason: r.reason,
              },
              "relay failed",
            );
          }
        });
      }
    }
  }

  if (channels.web_push) {
    const pushDeps = getAdminIncidentStaffPushDeps();
    if (!pushDeps) {
      logger.info({
        scope: "operator_alert",
        event: "operator_alert_skipped_no_push_runtime",
        channel: "web_push",
      });
    } else {
      anyChannelAttempted = true;
      void sendAdminIncidentStaffWebPush(
        {
          topic: input.topic,
          dedupKey: dk,
          pushTitle,
          pushBody,
          pushUrl,
        },
        pushDeps,
      )
        .then((delivered) => {
          if (delivered === 0) {
            logger.info({
              scope: "operator_alert",
              event: "operator_alert_skipped_no_recipients",
              channel: "web_push",
              block: input.block,
            });
          }
        })
        .catch((err: unknown) => {
          logger.warn({ err, block: input.block, topic: input.topic }, "operator alert web push failed");
        });
    }
  }

  if (dedupPort && anyChannelAttempted) {
    await dedupPort.recordSent({ dedupKey: dk, severity: input.block });
  }

  return { dispatched: anyChannelAttempted, reason: anyChannelAttempted ? undefined : "no_recipients" };
}
