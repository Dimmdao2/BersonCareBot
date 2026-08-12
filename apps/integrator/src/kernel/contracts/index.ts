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
  OutboundMessageCapability,
  OutboundMessageClass,
  OutboundMessagePolicyMeta,
  IncomingEvent,
  IncomingEventType,
  IntentMeta,
  OutgoingIntent,
  OutgoingEventType,
  OutgoingIntentType,
  OutgoingEvent,
} from './events.js';

export { OUTBOUND_MESSAGE_CAPABILITIES, OUTBOUND_MESSAGE_CLASSES } from './events.js';

export type { Script, ScriptContext, ScriptId } from './scripts.js';

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

export type { Step, StepMode, StepResult, StepStatus } from './steps.js';

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
  DbWriteDbResult,
  DbWriteMutation,
  PhoneLinkFailureReason,
  DbWriteMutationType,
  DbWritePort,
  DeliveryAdapter,
  DeliverySendResult,
  DeliveryDefaults,
  DeliveryDefaultsPort,
  DispatchPort,
  EventGateway,
  GatewayResult,
  IdempotencyPort,
  JobQueuePort,
  Orchestrator,
  OrchestratorResult,
  OutgoingDispatcher,
  ProtectedAccessPort,
  QueuePort,
  ActorResolutionPort,
  ActorResolutionRequest,
  TemplatePort,
  WebappEventsPort,
  WebappEventBody,
  DeliveryTargetsPort,
  DeliveryTargetsFetchOptions,
  DeliveryTargetsChannelBindings,
  RemindersReadsPort,
  RemindersWebappWritesPort,
  ReminderRuleListItem,
  ReminderRuleDetail,
  ReminderOccurrenceHistoryItem,
  AppointmentsReadsPort,
  BookingRecordForLinking,
  ActiveBookingRecord,
  WebPushAccessPort,
  WebPushSubscriptionPayload,
  VapidCredentials,
} from './ports.js';

export {
  REMINDER_RULE_UPSERTED,
  REMINDER_OCCURRENCE_FINALIZED,
  REMINDER_DELIVERY_LOGGED,
  CONTENT_ACCESS_GRANTED,
} from './projectionEventTypes.js';
export type { ReminderProjectionEventType } from './projectionEventTypes.js';

export type { MessengerStaffChannel, ResolveMessengerStaffAdmin } from './messengerStaff.js';

export type {
  Channel,
  UnifiedContent,
  UnifiedOutgoingMessage,
  UnifiedRecipient,
} from './unifiedMessage.js';

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
