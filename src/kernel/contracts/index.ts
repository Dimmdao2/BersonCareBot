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
  Action,
  ActionResult,
  DeliveryAttemptResult,
  DeliveryJob,
  DeliveryFailPolicy,
  DeliveryPlanStage,
  DeliveryRetryPolicy,
  DeliveryTarget,
  DomainContext,
  ScriptStep,
} from './actions.js';

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
  DeliveryAdapter,
  DispatchPort,
  EventGateway,
  GatewayResult,
  IdempotencyPort,
  JobQueuePort,
  NotificationSettings,
  NotificationSettingsPatch,
  NotificationsPort,
  Orchestrator,
  OrchestratorResult,
  OutgoingDispatcher,
  QueuePort,
  TelegramUserFrom,
  TelegramUserRow,
  TemplatePort,
  UserPort,
} from './ports.js';

export {
  DEFAULT_DELIVERY_CHANNEL,
  DELIVERY_CHANNEL_SMSC,
  DELIVERY_CHANNEL_TELEGRAM,
} from './ports.js';

export {
  actionResultSchema,
  actionSchema,
  dbReadQuerySchema,
  dbWriteMutationSchema,
  deliveryJobSchema,
  domainContextSchema,
  incomingEventSchema,
  outgoingIntentSchema,
  scriptStepSchema,
} from './schemas.js';
