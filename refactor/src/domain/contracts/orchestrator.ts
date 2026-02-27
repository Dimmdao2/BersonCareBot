import type { DbReadQuery, DbWriteMutation } from './storage.js';
import type { IncomingEvent, OutgoingEvent } from './events.js';

/** Результат обработки входящего события оркестратором. */
export type OrchestratorResult = {
  reads: DbReadQuery[];
  writes: DbWriteMutation[];
  outgoing: OutgoingEvent[];
};

/** Публичный интерфейс оркестратора событий. */
export type Orchestrator = {
  orchestrate(event: IncomingEvent): Promise<OrchestratorResult>;
};

/** Единая входная точка домена для нормализованных входящих событий. */
export type EventGateway = {
  handleIncomingEvent(event: IncomingEvent): Promise<void>;
};

/** Порт чтения данных, используемый оркестратором/скриптами. */
export type DbReadPort = {
  readDb<T = unknown>(query: DbReadQuery): Promise<T>;
};

/** Порт записи данных, используемый оркестратором/скриптами. */
export type DbWritePort = {
  writeDb(mutation: DbWriteMutation): Promise<void>;
};

/** Порт отправки исходящего события во внешний транспорт. */
export type OutgoingDispatcher = {
  dispatchOutgoing(event: OutgoingEvent): Promise<void>;
};
