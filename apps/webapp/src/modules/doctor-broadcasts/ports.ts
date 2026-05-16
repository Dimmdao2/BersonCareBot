import type { ClientListItem } from "@/modules/doctor-clients/ports";
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
  /**
   * После доставки в мессенджер — подмешать главное меню в это сообщение (reply keyboard / MAX inline),
   * как при обычной доставке с привязанным телефоном. По умолчанию выключено.
   */
  attachMenuAfterSend?: boolean;
};

/** Макс. имён в предпросмотре списка получателей (остальные — счётчиком). */
export const BROADCAST_RECIPIENT_PREVIEW_NAME_CAP = 20;

export type BroadcastRecipientsPreview = {
  /** Имена по алфавиту (первые до `BROADCAST_RECIPIENT_PREVIEW_NAME_CAP`). */
  names: string[];
  /** Как `BroadcastPreviewResult.audienceSize` для этого же превью. */
  total: number;
  truncated: boolean;
};

/** Классификация политики доставки (превью / подпись перед отправкой). */
export type BroadcastDeliveryPolicyKind =
  | "respect_prefs_bot"
  | "telegram_isolate_bot"
  | "max_isolate_bot"
  | "respect_prefs_sms"
  | "sms_isolate"
  | "respect_prefs_bot_sms"
  | "telegram_isolate_bot_respect_prefs_sms"
  | "telegram_isolate_bot_sms_isolate"
  | "max_isolate_bot_respect_prefs_sms"
  | "max_isolate_bot_sms_isolate"
  | "none";

/** Результат preview (dry-run): сколько пользователей попало, без отправки. */
export type BroadcastPreviewResult = {
  /**
   * Клиенты с ≥ одной возможной строкой очереди: после сужения **`dev_mode` для мессенджеров** (если включён),
   * затем **`user_channel_preferences`** и изоляция (**`with_telegram`** / **`with_max`** / **`sms_only`**).
   */
  audienceSize: number;
  /**
   * Размер сегмента по выбранному фильтру без сужения dev_mode.
   * Заполняется, когда `audienceSize` меньше (показать в UI «в сегменте N…»).
   */
  segmentSize?: number;
  /**
   * Список получателей в UI (те же клиенты, что и **`audienceSize`**: после dev_mode, prefs и isolate).
   * Для сегментов с грубой оценкой числа см. **`isAudienceEstimateApproximate`** в UI — блок может быть скрыт.
   */
  recipientsPreview?: BroadcastRecipientsPreview;
  category: BroadcastCategory;
  audienceFilter: BroadcastAudienceFilter;
  channels: BroadcastChannel[];
  deliveryPolicyKind: BroadcastDeliveryPolicyKind;
  deliveryPolicyDescriptionRu: string;
};

/** Запись в журнале рассылок (аудит). */
export type BroadcastAuditEntry = {
  id: string;
  actorId: string;
  category: BroadcastCategory;
  audienceFilter: BroadcastAudienceFilter;
  messageTitle: string;
  /** Полный текст (заголовок + тело) на момент отправки — для деталей в журнале. */
  messageBody: string;
  channels: BroadcastChannel[];
  executedAt: string;
  previewOnly: boolean;
  audienceSize: number;
  /** Число строк `outgoing_delivery_queue` для этой рассылки; 0 — запись до внедрения очереди. */
  deliveryJobsTotal: number;
  /** Флаг на момент отправки: обновлять меню в чате бота при доставке. */
  attachMenuAfterSend: boolean;
  sentCount: number;
  errorCount: number;
};

export type BroadcastAuditPort = {
  append(entry: Omit<BroadcastAuditEntry, "id" | "executedAt">): Promise<BroadcastAuditEntry>;
  list(limit?: number): Promise<BroadcastAuditEntry[]>;
};

/** Одна строка очереди доставки рассылки врача. */
export type DoctorBroadcastQueueJob = {
  eventId: string;
  kind: string;
  channel: string;
  payloadJson: Record<string, unknown>;
  maxAttempts: number;
};

/** Транзакция: INSERT `broadcast_audit` + пакет INSERT в `outgoing_delivery_queue`. */
export type DoctorBroadcastDeliveryCommitPort = {
  commitAuditAndDeliveryQueue(input: {
    /** Заранее сгенерированный id аудита (стабильные `event_id` в очереди). */
    auditId: string;
    audit: Omit<BroadcastAuditEntry, "id" | "executedAt">;
    jobs: readonly DoctorBroadcastQueueJob[];
  }): Promise<BroadcastAuditEntry>;
};

/** Флаги `is_enabled_for_notifications` по кодам после batch (нет строки в БД ⇒ true). */
export type BroadcastNotificationPrefsFlags = {
  telegram: boolean;
  max: boolean;
  sms: boolean;
};

/**
 * Единый резолвер аудитории для preview и execute.
 * - **`effectiveClients`** — множество после сегмента и **`resolveBroadcastEffectiveClients`** (dev_mode для TG/MAX).
 * - **`eligibleClients`** — пересечение с prefs/isolate-сегментом; именно они получают задачи очереди (как `audienceSize`).
 */
export type BroadcastAudienceResolveResult = {
  audienceSize: number;
  segmentSize?: number;
  recipientsPreview: BroadcastRecipientsPreview;
  effectiveClients: ClientListItem[];
  eligibleClients: ClientListItem[];
  audienceFilter: BroadcastAudienceFilter;
  notificationPrefsByUserId: ReadonlyMap<string, BroadcastNotificationPrefsFlags>;
  deliveryPolicyKind: BroadcastDeliveryPolicyKind;
  deliveryPolicyDescriptionRu: string;
};

export type { BroadcastChannel } from "./broadcastChannels";
