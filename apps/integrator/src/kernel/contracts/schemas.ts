import { z } from 'zod';

/** Zod-схема метаданных event-конверта. */
const dedupFingerprintSchema = z.record(z.string(), z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]));

const eventMetaSchema = z.object({
  eventId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  source: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  dedupFingerprint: dedupFingerprintSchema.optional(),
});

const baseContextSchema = z.object({
  actor: z.object({
    isAdmin: z.boolean(),
    tenantId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
  }),
  identityLinks: z.array(z.object({
    kind: z.string().min(1),
    value: z.string().min(1),
    provider: z.string().min(1).optional(),
  })),
  facts: z.record(z.string(), z.unknown()).optional(),
  preferences: z.object({
    locale: z.string().min(1).optional(),
    channels: z.array(z.string().min(1)).optional(),
    delivery: z.object({
      firstAttemptDelaySeconds: z.number().int().min(0).optional(),
      maxAttemptsBeforeFallback: z.number().int().min(1).optional(),
    }).optional(),
  }).optional(),
  conversationState: z.string().min(1).optional(),
  linkedPhone: z.boolean().optional(),
  phoneNormalized: z.string().min(1).optional(),
  hasActiveDraft: z.boolean().optional(),
  draftState: z.string().min(1).optional(),
  draftTextCurrent: z.string().min(1).optional(),
  draftSourceMessageId: z.string().min(1).optional(),
  hasOpenConversation: z.boolean().optional(),
  activeConversationId: z.string().min(1).optional(),
  activeConversationStatus: z.string().min(1).optional(),
  replyMode: z.boolean().optional(),
  replyConversationId: z.string().min(1).optional(),
});

/** Валидация входящего события pipeline. */
export const incomingEventSchema = z.object({
  type: z.enum([
    'message.received',
    'callback.received',
    'webhook.received',
    'schedule.tick',
    'admin.command',
  ]),
  meta: eventMetaSchema,
  payload: z.record(z.string(), z.unknown()),
});

/** Валидация исходящего намерения pipeline. */
export const outgoingIntentSchema = z.object({
  type: z.enum([
    'message.send',
    'message.copy',
    'message.edit',
    'message.replyMarkup.edit',
    'callback.answer',
    'booking.changed',
    'integration.sync',
    'audit.log',
  ]),
  meta: eventMetaSchema,
  payload: z.record(z.string(), z.unknown()),
});

/** Валидация доменного контекста события. */
export const domainContextSchema = z.object({
  event: incomingEventSchema,
  nowIso: z.iso.datetime(),
  values: z.record(z.string(), z.unknown()),
  base: baseContextSchema,
  user: z.object({
    id: z.string().min(1).optional(),
    channelId: z.string().min(1).optional(),
    phoneNormalized: z.string().min(1).nullable().optional(),
    isAdmin: z.boolean().optional(),
    channels: z.array(z.string().min(1)).optional(),
  }).optional(),
});

/** Валидация шага скрипта оркестратора. */
export const scriptStepSchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  mode: z.enum(['sync', 'async']),
  params: z.record(z.string(), z.unknown()),
});

/** Валидация доменной команды executor. */
export const actionSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  mode: z.enum(['sync', 'async']),
  params: z.record(z.string(), z.unknown()),
});

/** Валидация задачи доставки/runtime. */
export const deliveryJobSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  jobId: z.string().min(1).optional(),
  tenantId: z.string().min(1).nullable().optional(),
  createdAt: z.iso.datetime().optional(),
  status: z.enum(['pending', 'processing', 'done', 'dead']).optional(),
  attemptsMade: z.number().int().min(0).optional(),
  plan: z.array(z.object({
    stageId: z.string().min(1),
    channel: z.string().min(1),
    maxAttempts: z.number().int().min(1),
  })).optional(),
  targets: z.array(z.object({
    resource: z.string().min(1),
    address: z.record(z.string(), z.unknown()),
  })).optional(),
  retry: z.object({
    maxAttempts: z.number().int().min(1),
    backoffSeconds: z.array(z.number().int().min(0)),
    deadlineAt: z.iso.datetime().optional(),
  }).optional(),
  onFail: z.object({
    adminNotifyIntent: z.object({
      type: z.enum(['message.send', 'booking.changed', 'integration.sync', 'audit.log']),
      meta: eventMetaSchema,
      payload: z.record(z.string(), z.unknown()),
    }).optional(),
  }).optional(),
  runAt: z.iso.datetime(),
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  payload: z.record(z.string(), z.unknown()),
}).refine((job) => job.attempts <= job.maxAttempts, {
  message: 'attempts must be <= maxAttempts',
  path: ['attempts'],
});

/** Валидация результата выполнения domain action. */
export const actionResultSchema = z.object({
  actionId: z.string().min(1),
  status: z.enum(['success', 'failed', 'queued', 'skipped']),
  values: z.record(z.string(), z.unknown()).optional(),
  writes: z.array(z.lazy(() => dbWriteMutationSchema)).optional(),
  intents: z.array(outgoingIntentSchema).optional(),
  jobs: z.array(deliveryJobSchema).optional(),
  error: z.string().min(1).optional(),
});

/** Валидация read-контракта для DB-порта. */
export const dbReadQuerySchema = z.object({
  type: z.enum([
    'user.lookup',
    'user.byChannelId',
    'user.byIdentity',
    'user.byPhone',
    'draft.activeByIdentity',
    'conversation.openByIdentity',
    'conversation.byId',
    'conversation.listOpen',
    'questions.unanswered',
    'question.byConversationId',
    'identity.idByResourceAndExternalId',
    'notifications.settings',
    'booking.byExternalId',
    'booking.activeByUser',
    'stats.adminDashboard',
    'reminders.rules.forUser',
    'reminders.rule.forUserAndCategory',
    'reminders.rules.enabled',
    'reminders.occurrences.forRuleRange',
    'reminders.occurrences.due',
    'delivery.pending',
  ]),
  params: z.record(z.string(), z.unknown()),
});

/** Валидация write-контракта для DB-порта. */
export const dbWriteMutationSchema = z.object({
  type: z.enum([
    'identity.ensure',
    'user.upsert',
    'user.state.set',
    'user.phone.link',
    'draft.upsert',
    'draft.cancel',
    'conversation.open',
    'conversation.message.add',
    'conversation.state.set',
    'question.create',
    'question.message.add',
    'question.markAnswered',
    'notifications.update',
    'reminders.rule.upsert',
    'reminders.occurrence.upsertPlanned',
    'reminders.occurrence.markQueued',
    'reminders.occurrence.markSent',
    'reminders.occurrence.markFailed',
    'reminders.delivery.log',
    'content.access.grant.create',
    'booking.upsert',
    'message.retry.enqueue',
    'delivery.attempt.log',
    'event.log',
  ]),
  params: z.record(z.string(), z.unknown()),
});
