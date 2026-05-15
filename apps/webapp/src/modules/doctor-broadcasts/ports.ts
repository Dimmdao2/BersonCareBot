import type { BroadcastChannel } from "./broadcastChannels";

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
  /** Если не задано на границе — сервис подставляет активные каналы по умолчанию. */
  channels?: BroadcastChannel[];
};

/** Макс. имён в предпросмотре списка получателей (остальные — счётчиком). */
export const BROADCAST_RECIPIENT_PREVIEW_NAME_CAP = 20;

export type BroadcastRecipientsPreview = {
  /** Имена по алфавиту (первые до `BROADCAST_RECIPIENT_PREVIEW_NAME_CAP`). */
  names: string[];
  /** Число получателей с учётом dev_mode / каналов (как `audienceSize`). */
  total: number;
  truncated: boolean;
};

/** Результат preview (dry-run): сколько пользователей попало, без отправки. */
export type BroadcastPreviewResult = {
  /** Ожидаемое число получателей с учётом relay dev_mode (если включён — пересечение с тестовыми Telegram/Max). */
  audienceSize: number;
  /**
   * Размер сегмента по выбранному фильтру без сужения dev_mode.
   * Заполняется, когда `audienceSize` меньше (показать в UI «в сегменте N…»).
   */
  segmentSize?: number;
  /** Имена эффективных получателей (сегмент + dev_mode при включённом relay). */
  recipientsPreview?: BroadcastRecipientsPreview;
  category: BroadcastCategory;
  audienceFilter: BroadcastAudienceFilter;
  channels: BroadcastChannel[];
};

/** Запись в журнале рассылок (аудит). */
export type BroadcastAuditEntry = {
  id: string;
  actorId: string;
  category: BroadcastCategory;
  audienceFilter: BroadcastAudienceFilter;
  messageTitle: string;
  channels: BroadcastChannel[];
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

export type { BroadcastChannel } from "./broadcastChannels";
