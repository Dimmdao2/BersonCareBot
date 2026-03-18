import type { MessageLogEntry, MessageLogPort } from "@/modules/doctor-messaging/ports";

const store: MessageLogEntry[] = [];

export const inMemoryMessageLogPort: MessageLogPort = {
  async append(entry): Promise<MessageLogEntry> {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const sentAt = new Date().toISOString();
    const full: MessageLogEntry = { ...entry, id, sentAt };
    store.push(full);
    return full;
  },
  async listByUser(userId: string, limit = 50): Promise<MessageLogEntry[]> {
    return store
      .filter((e) => e.userId === userId)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
      .slice(0, limit);
  },
};
