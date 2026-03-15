import type { DeliveryAttemptResult, DeliveryJob } from './actions.js';
import type {
  ContentScript,
  ContentTemplate,
  OrchestratorInput,
  OrchestratorPlan,
} from './orchestrator.js';
import type { IncomingEvent, OutgoingIntent } from './events.js';
import type {
  ContentCatalogItem,
  ContentCatalogSection,
  IssuedContentAccess,
} from './reminders.js';

/** Категории read-запросов к хранилищу. */
export type DbReadQueryType =
  | 'user.lookup'
  | 'user.byChannelId'
  | 'user.byIdentity'
  | 'user.byPhone'
  | 'draft.activeByIdentity'
  | 'conversation.openByIdentity'
  | 'conversation.byId'
  | 'conversation.listOpen'
  | 'questions.unanswered'
  | 'question.byConversationId'
  | 'identity.idByResourceAndExternalId'
  | 'notifications.settings'
  | 'booking.byExternalId'
  | 'booking.activeByUser'
  | 'stats.adminDashboard'
  | 'reminders.rules.forUser'
  | 'reminders.rule.forUserAndCategory'
  | 'reminders.rules.enabled'
  | 'reminders.occurrences.forRuleRange'
  | 'reminders.occurrences.due'
  | 'delivery.pending';

/** Категории write-мутаций к хранилищу. */
export type DbWriteMutationType =
  | 'user.upsert'
  | 'user.state.set'
  | 'user.phone.link'
  | 'draft.upsert'
  | 'draft.cancel'
  | 'conversation.open'
  | 'conversation.message.add'
  | 'conversation.state.set'
  | 'question.create'
  | 'question.message.add'
  | 'question.markAnswered'
  | 'notifications.update'
  | 'reminders.rule.upsert'
  | 'reminders.occurrence.upsertPlanned'
  | 'reminders.occurrence.markQueued'
  | 'reminders.occurrence.markSent'
  | 'reminders.occurrence.markFailed'
  | 'reminders.delivery.log'
  | 'content.access.grant.create'
  | 'booking.upsert'
  | 'message.retry.enqueue'
  | 'delivery.attempt.log'
  | 'event.log';

/** Универсальный read-запрос к БД. */
export type DbReadQuery = {
  type: DbReadQueryType;
  params: Record<string, unknown>;
};

/** Универсальная write-мутация к БД. */
export type DbWriteMutation = {
  type: DbWriteMutationType;
  params: Record<string, unknown>;
};

/** Унифицированный порт БД (без pg-типов). */
export type DbQueryResult<T = unknown> = {
  rows: T[];
  rowCount?: number;
};

export type DbPort = {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>>;
  tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T>;
};

/** Порт чтения данных, используемый orchestrator/domain. */
export type DbReadPort = {
  readDb<T = unknown>(query: DbReadQuery): Promise<T>;
};

/** Порт записи данных, используемый orchestrator/domain. */
export type DbWritePort = {
  writeDb(mutation: DbWriteMutation): Promise<void>;
};

/** Порт отправки исходящих намерений во внешний транспорт. */
export type DispatchPort = {
  dispatchOutgoing(intent: OutgoingIntent): Promise<void>;
};

/** Универсальный адаптер доставки для infra dispatcher. */
export type DeliveryAdapter = {
  canHandle(intent: OutgoingIntent): boolean;
  send(intent: OutgoingIntent): Promise<void>;
};

/** Порт постановки асинхронной задачи в очередь. */
export type QueuePort = {
  enqueue(task: { kind: string; payload: Record<string, unknown> }): Promise<void>;
};

/** Порт очереди job-ов для runtime worker. */
export type JobQueuePort = {
  claimDueJobs(limit: number): Promise<DeliveryJob[]>;
  completeJob(jobId: string): Promise<void>;
  failJob(jobId: string, result: DeliveryAttemptResult): Promise<void>;
  rescheduleJob(jobId: string, nextRunAt: string, attemptsMade: number): Promise<void>;
  logAttempt(jobId: string, result: DeliveryAttemptResult): Promise<void>;
};

/** Порт запроса дополнительного контекста для оркестратора. */
export type ContextQuery =
  | { type: 'channel.lookupByPhone'; phoneNormalized: string; resource?: string }
  | { type: 'subscriptions.forUser'; userId: string }
  | { type: 'user.identityLinks'; userId: string }
  | { type: 'bookings.forUser'; userId: string }
  | { type: 'booking.recordByExternalId'; recordId: string }
  | { type: 'admin.stats' };

export type ContextQueryPort = {
  request(query: ContextQuery): Promise<unknown>;
};

/**
 * Scope for content selection. Orchestrator passes only source + audience;
 * registry/contentPort encapsulate bundle resolution (no filesystem knowledge in domain).
 */
export type ContentAudience = 'user' | 'admin';

export type ContentSelectionScope = {
  source: string;
  audience: ContentAudience;
};

/** Bundle view for menu expansion (menus.main → inlineKeyboard). */
export type ContentBundleView = {
  scripts: ContentScript[];
  templates: Record<string, unknown>;
  menus?: Record<string, unknown>;
  /** Main reply keyboard rows (from replyMenu.json); used when sendMenuOnButtonPress is enabled. */
  mainReplyKeyboard?: unknown[];
};

/** Порт доступа к JSON-скриптам и шаблонам контента. */
export type ContentPort = {
  /** Preferred: resolve scripts by scope (source + audience). */
  getScripts?(scope: ContentSelectionScope): Promise<ContentScript[]>;
  /** Legacy: scripts by source only (treated as user bundle when getScripts is used). */
  getScriptsBySource?: (source: string) => Promise<ContentScript[]>;
  /** Full bundle for scope (used to resolve params.menu → inlineKeyboard). */
  getBundle?(scope: ContentSelectionScope): Promise<ContentBundleView | null>;
  /** Resolve template by scope and templateId. */
  getTemplate(scope: ContentSelectionScope, templateId: string): Promise<ContentTemplate | null>;
  /** Legacy template lookup by key "source:templateId" (used when scope not passed). */
  getTemplateByKey?(key: string): Promise<ContentTemplate | null>;
};

/** Базовый payload пользователя внешнего канала, используемый в пользовательских портах. */
export type ChannelUserFrom = {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

export type ChannelUserRow = { id: string; channel_id: string };

export type ActorResolutionRequest = {
  source: string;
  isUserOriginated: boolean;
  externalActorId?: string;
  profile?: {
    username?: string;
    firstName?: string;
    lastName?: string;
  };
};

export type ActorResolutionPort = {
  ensureActor(input: ActorResolutionRequest): Promise<void>;
};

/** Контракт хранилища пользователей внешнего канала. */
export type ChannelUserPort = {
  upsertUser(from: ChannelUserFrom | null | undefined): Promise<ChannelUserRow | null>;
  setUserState(channelUserId: string, state: string | null): Promise<void>;
  setUserPhone(channelUserId: string, phoneNormalized: string): Promise<void>;
  getUserState(channelUserId: string): Promise<string | null>;
  tryAdvanceLastUpdateId(channelUserId: number, updateId: number): Promise<boolean>;
  tryConsumeStart(channelUserId: number): Promise<boolean>;
};

/** Настройки уведомлений пользователя. */
export type NotificationSettings = {
  notify_spb: boolean;
  notify_msk: boolean;
  notify_online: boolean;
  notify_bookings: boolean;
};

export type NotificationSettingsPatch = {
  notify_spb?: boolean;
  notify_msk?: boolean;
  notify_online?: boolean;
  notify_bookings?: boolean;
};

export type NotificationsPort = {
  getNotificationSettings(channelUserId: number): Promise<NotificationSettings | null>;
  updateNotificationSettings(channelUserId: number, settings: NotificationSettingsPatch): Promise<void>;
};

export type ContentCatalogPort = {
  getSectionLink(input: { section: ContentCatalogSection; userId?: string }): Promise<string | null>;
  getRandomItem(input: { section: ContentCatalogSection; userId?: string }): Promise<ContentCatalogItem | null>;
};

export type ProtectedAccessPort = {
  issueAccess(input: {
    userId: string;
    contentId: string;
    purpose: 'reminder' | 'library' | 'emergency';
    ttlSeconds: number;
  }): Promise<IssuedContentAccess | null>;
};

/** Порт идемпотентности входящих событий. */
export type IdempotencyPort = {
  tryAcquire(key: string, ttlSec: number): Promise<boolean>;
};

/** Порт времени для детерминированных сценариев/тестов. */
export type ClockPort = {
  nowIso(): string;
};

/** Порт шаблонизатора для compose-этапа в domain executor. */
export type TemplatePort = {
  renderTemplate(input: {
    source: string;
    templateId: string;
    vars?: Record<string, unknown>;
    /** When set, template is resolved from the effective scope bundle (user/admin). */
    audience?: ContentAudience;
  }): Promise<{ text: string }>;
};

/** Дефолты политики доставки по источнику (каналы, retry). Реализация в infra; ядро не знает имён интеграций. */
export type DeliveryDefaults = {
  preferredLinkedChannels?: string[];
  defaultChannels?: string[];
  fallbackChannels?: string[];
  retry?: { maxAttempts: number; backoffSeconds: number[] };
};

/** Порт дефолтов доставки: по source (и опционально event/action) возвращает подставляемые значения. */
export type DeliveryDefaultsPort = {
  getDeliveryDefaults(
    source: string,
    options?: { eventType?: string; inputAction?: string },
  ): Promise<DeliveryDefaults | null>;
};

/** Результат оркестрации входящего события. */
export type OrchestratorResult = {
  reads: DbReadQuery[];
  writes: DbWriteMutation[];
  outgoing: OutgoingIntent[];
};

/** Публичный интерфейс оркестратора событий. */
export type Orchestrator = {
  buildPlan(input: OrchestratorInput): Promise<OrchestratorPlan>;
};

/** Единая входная точка ядра для нормализованных входящих событий. */
export type EventGateway = {
  handleIncomingEvent(event: IncomingEvent): Promise<GatewayResult>;
};

/** Итог работы eventGateway над одним событием. */
export type GatewayResult =
  | { status: 'accepted'; dedupKey: string; event: IncomingEvent }
  | { status: 'accepted_noop'; dedupKey: string; reason: string }
  | { status: 'rejected'; dedupKey: string; reason: string }
  | { status: 'dropped'; dedupKey: string; reason: string };

/** Совместимый алиас прежнего имени dispatch-контракта. */
export type OutgoingDispatcher = DispatchPort;
