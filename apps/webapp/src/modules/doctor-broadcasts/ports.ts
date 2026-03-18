/** Категория рассылки (обязательный выбор). */
export type BroadcastCategory =
  | "service"
  | "organizational"
  | "marketing"
  | "important_notice"
  | "schedule_change"
  | "reminder"
  | "education"
  | "survey";

/** Фильтр аудитории для рассылки. */
export type BroadcastAudienceFilter =
  | "all"
  | "active_clients"
  | "with_upcoming_appointment"
  | "without_appointment"
  | "with_telegram"
  | "with_max"
  | "sms_only"
  | "inactive";

export type BroadcastCommand = {
  category: BroadcastCategory;
  audienceFilter: BroadcastAudienceFilter;
  message: { title: string; body: string };
  actorId: string;
};

/** Результат preview (dry-run): сколько пользователей попало, без отправки. */
export type BroadcastPreviewResult = {
  audienceSize: number;
  category: BroadcastCategory;
  audienceFilter: BroadcastAudienceFilter;
};

/** Запись в журнале рассылок (аудит). */
export type BroadcastAuditEntry = {
  id: string;
  actorId: string;
  category: BroadcastCategory;
  audienceFilter: BroadcastAudienceFilter;
  messageTitle: string;
  executedAt: string;
  previewOnly: boolean;
  audienceSize: number;
  sentCount: number;
  errorCount: number;
};

export type BroadcastAuditPort = {
  append(entry: Omit<BroadcastAuditEntry, "id" | "executedAt">): Promise<BroadcastAuditEntry>;
  list(limit?: number): Promise<BroadcastAuditEntry[]>;
};
