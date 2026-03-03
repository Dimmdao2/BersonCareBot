/**
 * Единая точка реэкспорта контрактов kernel-слоя.
 * Внешние слои импортируют типы только отсюда.
 */
export type {
  EventMeta,
  IncomingEvent,
  IncomingEventType,
  IntentMeta,
  OutgoingIntent,
  OutgoingEventType,
  OutgoingIntentType,
  OutgoingEvent,
} from './events.js';

export type {
  Script,
  ScriptContext,
  ScriptId,
} from './scripts.js';

export type {
  Step,
  StepMode,
  StepResult,
  StepStatus,
} from './steps.js';

export type {
  ClockPort,
  DbReadPort,
  DbReadQuery,
  DbReadQueryType,
  DbWriteMutation,
  DbWriteMutationType,
  DbWritePort,
  DispatchPort,
  EventGateway,
  GatewayResult,
  IdempotencyPort,
  Orchestrator,
  OrchestratorResult,
  OutgoingDispatcher,
  QueuePort,
} from './ports.js';

export {
  dbReadQuerySchema,
  dbWriteMutationSchema,
  incomingEventSchema,
  outgoingIntentSchema,
} from './schemas.js';
