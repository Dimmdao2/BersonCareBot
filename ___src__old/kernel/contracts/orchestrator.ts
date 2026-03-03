import type { DbReadQuery, DbWriteMutation } from './storage.js';
import type { IncomingEvent, OutgoingEvent } from './events.js';

export type OrchestratorResult = {
  reads: DbReadQuery[];
  writes: DbWriteMutation[];
  outgoing: OutgoingEvent[];
};

export type Orchestrator = {
  orchestrate(event: IncomingEvent): Promise<OrchestratorResult>;
};

export type DbReadPort = {
  readDb<T = unknown>(query: DbReadQuery): Promise<T>;
};

export type DbWritePort = {
  writeDb(mutation: DbWriteMutation): Promise<void>;
};

export type OutgoingDispatcher = {
  dispatchOutgoing(event: OutgoingEvent): Promise<void>;
};
