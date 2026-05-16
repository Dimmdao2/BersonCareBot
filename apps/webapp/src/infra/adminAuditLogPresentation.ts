/**
 * Pure helpers for rendering admin_audit_log rows in UI (doctor client card, settings log).
 * Avoids showing operator phone-as-display-name; surfaces merge parties as FIO when present in `details`.
 */

export function auditActorShortLabel(actorId: string | null | undefined, action: string): string {
  if (actorId != null && actorId !== "") {
    return "admin";
  }
  if (
    action === "auto_merge_conflict" ||
    action === "auto_merge_conflict_anomaly" ||
    action.startsWith("auto_merge")
  ) {
    return "auto-merge";
  }
  return "—";
}

export type MergeAuditLines = {
  targetId: string;
  duplicateId: string;
  targetDisplayName: string | null;
  duplicateDisplayName: string | null;
};

/** Parse `user_merge` / `integrator_user_merge` details; falls back to UUID strings when names missing. */
export function parseMergeAuditDetails(
  details: Record<string, unknown> | null | undefined,
  rowTargetId: string | null,
): MergeAuditLines | null {
  if (!details || typeof details !== "object") return null;
  const tid =
    typeof details.targetId === "string"
      ? details.targetId
      : rowTargetId && rowTargetId.length > 0
        ? rowTargetId
        : null;
  const did = typeof details.duplicateId === "string" ? details.duplicateId : null;
  if (!tid || !did) return null;
  const tdn = typeof details.targetDisplayName === "string" ? details.targetDisplayName : null;
  const ddn = typeof details.duplicateDisplayName === "string" ? details.duplicateDisplayName : null;
  return {
    targetId: tid,
    duplicateId: did,
    targetDisplayName: tdn?.trim() ? tdn.trim() : null,
    duplicateDisplayName: ddn?.trim() ? ddn.trim() : null,
  };
}

export function isMergeAuditAction(action: string): boolean {
  return action === "user_merge" || action === "integrator_user_merge";
}

export type MessengerBindAuditTargetRow = {
  platformUserId: string;
  label: string;
};

/** Parse `messenger_phone_bind_blocked` / `_anomaly` enriched `details.candidates` for admin tables. */
export function parseMessengerPhoneBindAuditTargets(
  details: Record<string, unknown> | null | undefined,
): MessengerBindAuditTargetRow[] | null {
  if (!details || typeof details !== "object") return null;
  const raw = details.candidates;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows: MessengerBindAuditTargetRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.platformUserId === "string" ? rec.platformUserId.trim() : "";
    if (!id) continue;
    const dn = typeof rec.displayName === "string" ? rec.displayName.trim() : "";
    rows.push({ platformUserId: id, label: dn.length > 0 ? dn : id });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.platformUserId.localeCompare(b.platformUserId));
  return rows;
}

export type MessengerBindAuditInitiatorParsed = {
  channelLabel: string;
  externalId: string;
  platformUserId: string | null;
  messengerDisplayHint: string | null;
};

/** Parse `details.initiator` from enriched messenger phone-bind audit rows. */
export function parseMessengerPhoneBindAuditInitiator(
  details: Record<string, unknown> | null | undefined,
): MessengerBindAuditInitiatorParsed | null {
  if (!details || typeof details !== "object") return null;
  const raw = details.initiator;
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const channelLabel = typeof rec.channelLabel === "string" ? rec.channelLabel.trim() : "";
  const externalId = typeof rec.externalId === "string" ? rec.externalId.trim() : "";
  if (!channelLabel || !externalId) return null;
  const platformUserId =
    typeof rec.platformUserId === "string" && rec.platformUserId.trim().length > 0
      ? rec.platformUserId.trim()
      : null;
  const messengerDisplayHint =
    typeof rec.messengerDisplayHint === "string" && rec.messengerDisplayHint.trim().length > 0
      ? rec.messengerDisplayHint.trim()
      : null;
  return { channelLabel, externalId, platformUserId, messengerDisplayHint };
}

export function isMessengerPhoneBindAuditAction(action: string): boolean {
  return action === "messenger_phone_bind_blocked" || action === "messenger_phone_bind_anomaly";
}
