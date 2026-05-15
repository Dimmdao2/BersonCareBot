import { createHash } from "node:crypto";
import { computeChannelLinkOwnershipConflictKey, type UpsertOpenConflictLogResult } from "@/infra/adminAuditLog";
import { logger } from "@/infra/logging/logger";
import { relayOutbound } from "@/modules/messaging/relayOutbound";
import { getConfigValue } from "@/modules/system-settings/configAdapter";
import { parseIdTokens } from "@/shared/parsers/parseIdTokens";
import {
  ADMIN_INCIDENT_ALERT_CONFIG_KEY,
  type AdminIncidentTopicKey,
  isAdminIncidentTopicEnabled,
  parseAdminIncidentAlertConfig,
} from "./adminIncidentAlertConfig";

const MAX_LINE = 500;

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
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

async function loadParsedConfigFromDb(): Promise<ReturnType<typeof parseAdminIncidentAlertConfig>> {
  try {
    const raw = await getConfigValue(ADMIN_INCIDENT_ALERT_CONFIG_KEY, "");
    const trimmed = raw.trim();
    if (!trimmed) return parseAdminIncidentAlertConfig(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return parseAdminIncidentAlertConfig(null);
    }
    return parseAdminIncidentAlertConfig(parsed);
  } catch (err) {
    logger.warn({ err }, "[admin_incident] load config failed, using defaults");
    return parseAdminIncidentAlertConfig(null);
  }
}

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Best-effort relay to admin Telegram/Max lists per system_settings toggles.
 */
export async function sendAdminIncidentRelayAlert(input: {
  topic: AdminIncidentTopicKey;
  dedupKey: string;
  lines: string[];
}): Promise<void> {
  const cfg = await loadParsedConfigFromDb();
  if (!isAdminIncidentTopicEnabled(cfg, input.topic)) return;

  const targets = await loadAdminRelayTargets();
  const text = clip(input.lines.map((l) => clip(l, MAX_LINE)).join("\n"), 3900);
  if (!text.trim()) return;

  const dk = clip(input.dedupKey.replace(/[^a-zA-Z0-9:_-]/g, "_"), 120);
  const sends: Promise<void>[] = [];

  if (cfg.channels.telegram) {
    if (targets.telegram.length === 0) {
      logger.info({ scope: "admin_incident", event: "admin_incident_alert_skipped_no_recipients", channel: "telegram" });
    } else {
      for (const id of targets.telegram) {
        const messageId = `admin-incident:${input.topic}:${dk}:telegram:${id}`;
        sends.push(
          relayOutbound({ messageId, channel: "telegram", recipient: id, text }).then((r) => {
            if (!r.ok) {
              logger.warn(
                {
                  scope: "admin_incident",
                  event: "admin_incident_relay_failed",
                  topic: input.topic,
                  channel: "telegram",
                  recipient: id,
                  reason: r.reason,
                },
                "relay failed",
              );
            }
          }),
        );
      }
    }
  }

  if (cfg.channels.max) {
    if (targets.max.length === 0) {
      logger.info({ scope: "admin_incident", event: "admin_incident_alert_skipped_no_recipients", channel: "max" });
    } else {
      for (const id of targets.max) {
        const messageId = `admin-incident:${input.topic}:${dk}:max:${id}`;
        sends.push(
          relayOutbound({ messageId, channel: "max", recipient: id, text }).then((r) => {
            if (!r.ok) {
              logger.warn(
                {
                  scope: "admin_incident",
                  event: "admin_incident_relay_failed",
                  topic: input.topic,
                  channel: "max",
                  recipient: id,
                  reason: r.reason,
                },
                "relay failed",
              );
            }
          }),
        );
      }
    }
  }

  await Promise.all(sends);
}

export type ChannelLinkBindingConflictCtx = {
  channelCode: string;
  externalId: string;
  tokenUserId: string;
  existingUserId: string;
};

/** Dedup key for binding conflict (stable for same pair + channel + external id). */
export function channelLinkBindingDedupKey(ctx: ChannelLinkBindingConflictCtx): string {
  const sorted = [ctx.tokenUserId, ctx.existingUserId].map((x) => x.trim()).filter(Boolean).sort();
  return `${ctx.channelCode}:${ctx.externalId}:${sorted.join("|")}`;
}

export function notifyChannelLinkBindingConflict(ctx: ChannelLinkBindingConflictCtx): Promise<void> {
  const lines = [
    `channel_link binding conflict`,
    `channel=${ctx.channelCode}`,
    `externalId=${ctx.externalId}`,
    `tokenUserId=${ctx.tokenUserId}`,
    `existingUserId=${ctx.existingUserId}`,
  ];
  return sendAdminIncidentRelayAlert({
    topic: "channel_link",
    dedupKey: channelLinkBindingDedupKey(ctx),
    lines,
  });
}

/** Relay on first open `channel_link_ownership_conflict` row (`insertedFirst` from {@link upsertOpenConflictLog}). */
export async function notifyChannelLinkOwnershipConflictRelay(
  upsertResult: UpsertOpenConflictLogResult,
  ctx: ChannelLinkBindingConflictCtx & { classifiedReason: string },
): Promise<void> {
  if (upsertResult.kind !== "conflict" || !upsertResult.insertedFirst) return;
  const dk = computeChannelLinkOwnershipConflictKey(
    ctx.channelCode,
    ctx.externalId,
    ctx.tokenUserId,
    ctx.existingUserId,
  );
  await sendAdminIncidentRelayAlert({
    topic: "channel_link",
    dedupKey: dk,
    lines: [
      "channel_link ownership conflict",
      `channel=${ctx.channelCode}`,
      `externalId=${ctx.externalId}`,
      `tokenUserId=${ctx.tokenUserId}`,
      `existingUserId=${ctx.existingUserId}`,
      `classifiedReason=${ctx.classifiedReason}`,
    ],
  });
}

/** After webapp HTTP messenger phone bind audit row for blocked path (dedup by conflict_key when present). */
export async function notifyMessengerPhoneBindBlockedFromWebapp(input: {
  conflictKey: string | null;
  reason: string;
  channelCode: string;
  externalId: string;
  phoneSuffix?: string;
  candidateIds: string[];
}): Promise<void> {
  const dk =
    input.conflictKey ??
    createHash("sha256")
      .update(
        `http_bind:${input.channelCode}:${input.externalId}:${input.reason}:${[...new Set(input.candidateIds.map((x) => x.trim()).filter(Boolean))].sort().join("|")}`,
      )
      .digest("hex");
  const lines = [
    "messenger_phone_bind_blocked (http_bind)",
    `reason=${input.reason}`,
    `channel=${input.channelCode}`,
    `externalId=${input.externalId}`,
    ...(input.phoneSuffix ? [`phoneSuffix=${input.phoneSuffix}`] : []),
    `candidateIds=${input.candidateIds.join(",")}`,
  ];
  await sendAdminIncidentRelayAlert({
    topic: "messenger_phone_bind_blocked",
    dedupKey: dk.slice(0, 120),
    lines,
  });
}
