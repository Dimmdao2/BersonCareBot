/** In-memory recipient rows per broadcast audit (dev / tests). */
const recipientsByAuditId = new Map<string, Set<string>>();

export function setInMemoryBroadcastRecipients(auditId: string, platformUserIds: readonly string[]): void {
  recipientsByAuditId.set(auditId, new Set(platformUserIds));
}

export function isInMemoryBroadcastRecipient(auditId: string, platformUserId: string): boolean {
  return recipientsByAuditId.get(auditId)?.has(platformUserId) ?? false;
}
