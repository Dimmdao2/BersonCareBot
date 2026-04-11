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
