/**
 * Единая точка реэкспорта доменных контрактов event-пайплайна.
 * Используется внешними слоями без прямых импортов отдельных файлов.
 */
export type {
  EventMeta,
  IncomingEvent,
  IncomingEventType,
  OutgoingEvent,
  OutgoingEventType,
} from './events.js';

export type {
  DbReadQuery,
  DbReadQueryType,
  DbWriteMutation,
  DbWriteMutationType,
} from './storage.js';

export type {
  DbReadPort,
  DbWritePort,
  EventGateway,
  Orchestrator,
  OrchestratorResult,
  OutgoingDispatcher,
} from './orchestrator.js';

export {
  incomingEventSchema,
  outgoingEventSchema,
  dbReadQuerySchema,
  dbWriteMutationSchema,
} from './schemas.js';
