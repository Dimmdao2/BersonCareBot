import type { BroadcastAuditEntry, BroadcastAuditPort } from "@/modules/doctor-broadcasts/ports";

const store: BroadcastAuditEntry[] = [];

export function pushInMemoryBroadcastAuditEntry(entry: BroadcastAuditEntry): void {
  store.push(entry);
}

export const inMemoryBroadcastAuditPort: BroadcastAuditPort = {
  async append(entry): Promise<BroadcastAuditEntry> {
    const id = `broadcast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const executedAt = new Date().toISOString();
    const full: BroadcastAuditEntry = {
      ...entry,
      messageBody: entry.messageBody ?? "",
      deliveryJobsTotal: entry.deliveryJobsTotal ?? 0,
      attachMenuAfterSend: entry.attachMenuAfterSend ?? false,
      id,
      executedAt,
    };
    store.push(full);
    return full;
  },
  async list(limit = 50): Promise<BroadcastAuditEntry[]> {
    return store
      .slice()
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
      .slice(0, limit);
  },
};
