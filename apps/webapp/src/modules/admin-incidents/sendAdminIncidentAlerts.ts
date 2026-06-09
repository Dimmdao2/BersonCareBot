import { createHash } from "node:crypto";
import { computeChannelLinkOwnershipConflictKey, type UpsertOpenConflictLogResult } from "@/infra/adminAuditLog";
import {
  ADMIN_INCIDENT_TOPIC_LABELS,
  type AdminIncidentTopicKey,
} from "./adminIncidentAlertConfig";
import { dispatchOperatorAlert } from "@/modules/operator-alerts/dispatchOperatorAlert";
import { adminIncidentTopicToAlertBlock } from "@/modules/operator-alerts/operatorHealthAlertConfig";

/**
 * Best-effort relay to admin Telegram/Max lists and staff web push per `operator_health_alert_config`.
 * Delivery is fire-and-forget — callers must not rely on await for channel completion.
 */
export async function sendAdminIncidentRelayAlert(input: {
  topic: AdminIncidentTopicKey;
  dedupKey: string;
  lines: string[];
}): Promise<void> {
  const block = adminIncidentTopicToAlertBlock(input.topic);
  if (!block) return;

  await dispatchOperatorAlert({
    block,
    topic: input.topic,
    dedupKey: input.dedupKey,
    lines: input.lines,
    pushTitle: ADMIN_INCIDENT_TOPIC_LABELS[input.topic],
  });
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
  /** Preformatted Russian plaintext lines for Telegram/Max; fallback if omitted */
  relayLines?: string[];
}): Promise<void> {
  const dk =
    input.conflictKey ??
    createHash("sha256")
      .update(
        `http_bind:${input.channelCode}:${input.externalId}:${input.reason}:${[...new Set(input.candidateIds.map((x) => x.trim()).filter(Boolean))].sort().join("|")}`,
      )
      .digest("hex");
  const lines =
    input.relayLines ??
    ([
      "messenger_phone_bind_blocked (http_bind)",
      `reason=${input.reason}`,
      `channel=${input.channelCode}`,
      `externalId=${input.externalId}`,
      ...(input.phoneSuffix ? [`phoneSuffix=${input.phoneSuffix}`] : []),
      `candidateIds=${input.candidateIds.join(",")}`,
    ] as string[]);
  await sendAdminIncidentRelayAlert({
    topic: "messenger_phone_bind_blocked",
    dedupKey: dk.slice(0, 120),
    lines,
  });
}
