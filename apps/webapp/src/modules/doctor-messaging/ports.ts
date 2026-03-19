/** Одна запись в журнале сообщений специалиста клиенту. */
export type MessageLogEntry = {
  id: string;
  userId: string;
  senderId: string;
  text: string;
  category: string;
  channelBindingsUsed: Record<string, string>;
  sentAt: string;
  outcome: "sent" | "partial" | "failed";
  errorMessage?: string | null;
};

export type MessageLogPort = {
  append(entry: Omit<MessageLogEntry, "id" | "sentAt">): Promise<MessageLogEntry>;
  listByUser(userId: string, limit?: number): Promise<MessageLogEntry[]>;
  listAll(limit?: number): Promise<MessageLogEntry[]>;
};
