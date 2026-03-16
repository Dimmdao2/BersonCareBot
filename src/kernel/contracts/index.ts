/**
 * Единая точка реэкспорта контрактов kernel-слоя.
 * Внешние слои импортируют типы только отсюда.
 */
export type {
  BaseContext,
  ContentScript,
  ContentScriptMatchObject,
  ContentScriptMatchValue,
  ContentScriptStep,
  ContentTemplate,
  IdentityLink,
  OrchestratorInput,
  OrchestratorPlan,
  OrchestratorPlanStep,
  Preferences,
} from './orchestrator.js';

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
  ContentCatalogItem,
  ContentCatalogSection,
  IssuedContentAccess,
  ReminderCategory,
  ReminderContentMode,
  ReminderOccurrenceRecord,
  ReminderOccurrenceStatus,
  ReminderRuleRecord,
  ReminderSchedulePreset,
  DueReminderOccurrence,
} from './reminders.js';

export type {
  ClockPort,
  ContentAudience,
  ContentBundleView,
  ContentCatalogPort,
  ContentPort,
  ContentSelectionScope,
  ContextQueryPort,
  ContextQuery,
  DbPort,
  DbQueryResult,
  DbReadPort,
  DbReadQuery,
  DbReadQueryType,
  DbWriteMutation,
  DbWriteMutationType,
  DbWritePort,
  DeliveryAdapter,
  DeliveryDefaults,
  DeliveryDefaultsPort,
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
  ProtectedAccessPort,
  QueuePort,
  ChannelUserFrom,
  ChannelUserRow,
  ActorResolutionPort,
  ActorResolutionRequest,
  TemplatePort,
  ChannelUserPort,
  WebappEventsPort,
  WebappEventBody,
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
