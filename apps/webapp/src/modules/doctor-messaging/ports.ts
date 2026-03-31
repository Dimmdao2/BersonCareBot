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

export type MessageLogListFilters = {
  userId?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type MessageLogListParams = {
  page?: number;
  pageSize?: number;
  filters?: MessageLogListFilters;
};

export type MessageLogListResult = {
  items: MessageLogEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type MessageLogPort = {
  append(entry: Omit<MessageLogEntry, "id" | "sentAt">): Promise<MessageLogEntry>;
  listByUser(userId: string, params?: Omit<MessageLogListParams, "filters">): Promise<MessageLogListResult>;
  listAll(params?: MessageLogListParams): Promise<MessageLogListResult>;
};
