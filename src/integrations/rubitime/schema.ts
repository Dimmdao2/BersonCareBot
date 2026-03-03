import { z } from 'zod';

/** Разрешенные типы Rubitime-событий о записи. */
const RubitimeEventSchema = z.enum([
  'event-create-record',
  'event-update-record',
  'event-remove-record',
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
