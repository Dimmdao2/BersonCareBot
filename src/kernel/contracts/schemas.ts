import { z } from 'zod';

/** Zod-схема метаданных event-конверта. */
const eventMetaSchema = z.object({
  eventId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  source: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
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
  user: z.object({
    id: z.string().min(1).optional(),
    telegramId: z.string().min(1).optional(),
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
  writes: z.array(z.lazy(() => dbWriteMutationSchema)).optional(),
  intents: z.array(outgoingIntentSchema).optional(),
  jobs: z.array(deliveryJobSchema).optional(),
  error: z.string().min(1).optional(),
});

/** Валидация read-контракта для DB-порта. */
export const dbReadQuerySchema = z.object({
  type: z.enum([
    'user.byTelegramId',
    'user.byPhone',
    'booking.byRubitimeId',
    'booking.activeByUser',
    'delivery.pending',
  ]),
  params: z.record(z.string(), z.unknown()),
});

/** Валидация write-контракта для DB-порта. */
export const dbWriteMutationSchema = z.object({
  type: z.enum([
    'user.upsert',
    'user.state.set',
    'user.phone.link',
    'booking.upsert',
    'rubitime.create_retry.enqueue',
    'delivery.attempt.log',
    'event.log',
  ]),
  params: z.record(z.string(), z.unknown()),
});
