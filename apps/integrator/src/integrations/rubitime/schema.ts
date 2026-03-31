import { z } from 'zod';

/** Разрешенные типы Rubitime-событий о записи. */
const RubitimeEventSchema = z.enum([
  'event-create-record',
  'event-update-record',
  'event-remove-record',
  'event-delete-record',
]);

/** Схема body входящего Rubitime webhook. */
export const RubitimeWebhookBodySchema = z.object({
  from: z.string(),
  event: RubitimeEventSchema,
  data: z.record(z.string(), z.unknown()),
});

/** Валидированный тип Rubitime webhook body. */
export type RubitimeWebhookBodyValidated = z.infer<typeof RubitimeWebhookBodySchema>;

/**
 * Валидирует сырой Rubitime webhook body.
 * Возвращает discriminated-union с `success`.
 */
export function parseRubitimeBody(raw: unknown): {
  success: true;
  data: RubitimeWebhookBodyValidated;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = RubitimeWebhookBodySchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

/** Описание входного запроса слотов из webapp к integrator M2M. */
export const RubitimeSlotsQuerySchema = z.object({
  type: z.enum(['in_person', 'online']),
  city: z.string().trim().optional(),
  category: z.enum(['rehab_lfk', 'nutrition', 'general']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type RubitimeSlotsQueryValidated = z.infer<typeof RubitimeSlotsQuerySchema>;

/** Нормализованный слот для webapp API. */
export const RubitimeSlotSchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
});

export type RubitimeSlot = z.infer<typeof RubitimeSlotSchema>;

/** Список слотов по дате для контракта GET /api/booking/slots. */
export const RubitimeSlotsByDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slots: z.array(RubitimeSlotSchema),
});

export type RubitimeSlotsByDate = z.infer<typeof RubitimeSlotsByDateSchema>;

export function parseRubitimeSlotsQuery(raw: unknown): {
  success: true;
  data: RubitimeSlotsQueryValidated;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = RubitimeSlotsQuerySchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
