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
    'delivery.attempt.log',
    'event.log',
  ]),
  params: z.record(z.string(), z.unknown()),
});
