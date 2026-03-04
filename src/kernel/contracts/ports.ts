import type { IncomingEvent, OutgoingIntent } from './events.js';
import type { StepResult } from './steps.js';

/** Категории read-запросов к хранилищу. */
export type DbReadQueryType =
  | 'user.byTelegramId'
  | 'user.byPhone'
  | 'booking.byRubitimeId'
  | 'booking.activeByUser'
  | 'delivery.pending';

/** Категории write-мутаций к хранилищу. */
export type DbWriteMutationType =
  | 'user.upsert'
  | 'user.state.set'
  | 'user.phone.link'
  | 'booking.upsert'
  | 'rubitime.create_retry.enqueue'
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

/** Порт постановки асинхронной задачи в очередь. */
export type QueuePort = {
  enqueue(task: { kind: string; payload: Record<string, unknown> }): Promise<void>;
};

/** Порт идемпотентности входящих событий. */
export type IdempotencyPort = {
  tryAcquire(key: string, ttlSec: number): Promise<boolean>;
};

/** Порт времени для детерминированных сценариев/тестов. */
export type ClockPort = {
  nowIso(): string;
};

/** Результат оркестрации входящего события. */
export type OrchestratorResult = {
  reads: DbReadQuery[];
  writes: DbWriteMutation[];
  outgoing: OutgoingIntent[];
};

/** Публичный интерфейс оркестратора событий. */
export type Orchestrator = {
  orchestrate(event: IncomingEvent): Promise<OrchestratorResult>;
};

/** Единая входная точка ядра для нормализованных входящих событий. */
export type EventGateway = {
  handleIncomingEvent(event: IncomingEvent): Promise<GatewayResult>;
};

/** Итог работы eventGateway над одним событием. */
export type GatewayResult =
  | { status: 'duplicate'; dedupKey: string }
  | { status: 'processed'; dedupKey: string; writesApplied: number; outgoingDispatched: number }
  | { status: 'failed'; dedupKey: string; error: string; partial?: StepResult[] };

/** Совместимый алиас прежнего имени dispatch-контракта. */
export type OutgoingDispatcher = DispatchPort;
