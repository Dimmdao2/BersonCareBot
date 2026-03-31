import type {
  MessageLogEntry,
  MessageLogListFilters,
  MessageLogListParams,
  MessageLogListResult,
  MessageLogPort,
} from "@/modules/doctor-messaging/ports";

const store: MessageLogEntry[] = [];

function applyFilters(items: MessageLogEntry[], filters?: MessageLogListFilters): MessageLogEntry[] {
  if (!filters) return items;
  let out = items;
  if (filters.userId) {
    out = out.filter((e) => e.userId === filters.userId);
  }
  if (filters.category) {
    out = out.filter((e) => e.category === filters.category);
  }
  if (filters.dateFrom) {
    const fromMs = new Date(filters.dateFrom).getTime();
    if (Number.isFinite(fromMs)) {
      out = out.filter((e) => new Date(e.sentAt).getTime() >= fromMs);
    }
  }
  if (filters.dateTo) {
    const toMs = new Date(filters.dateTo).getTime();
    if (Number.isFinite(toMs)) {
      out = out.filter((e) => new Date(e.sentAt).getTime() <= toMs);
    }
  }
  return out;
}

function toPaged(items: MessageLogEntry[], params?: MessageLogListParams): MessageLogListResult {
  const page = Math.max(1, Math.floor(params?.page ?? 1));
  const pageSize = Math.max(1, Math.floor(params?.pageSize ?? 20));
  const sorted = [...items].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  const filtered = applyFilters(sorted, params?.filters);
  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  return {
    items: filtered.slice(offset, offset + pageSize),
    total,
    page,
    pageSize,
  };
}

export const inMemoryMessageLogPort: MessageLogPort = {
  async append(entry): Promise<MessageLogEntry> {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const sentAt = new Date().toISOString();
    const full: MessageLogEntry = { ...entry, id, sentAt };
    store.push(full);
    return full;
  },
  async listByUser(userId: string, params): Promise<MessageLogListResult> {
    return toPaged(store, {
      page: params?.page,
      pageSize: params?.pageSize,
      filters: { userId },
    });
  },
  async listAll(params): Promise<MessageLogListResult> {
    return toPaged(store, params);
  },
};
