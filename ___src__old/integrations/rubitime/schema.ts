import { z } from 'zod';

const RubitimeEventSchema = z.enum([
  'event-create-record',
  'event-update-record',
  'event-remove-record',
]);

export const RubitimeWebhookBodySchema = z.object({
  from: z.string(),
  event: RubitimeEventSchema,
  data: z.record(z.string(), z.unknown()),
});

export type RubitimeWebhookBodyValidated = z.infer<typeof RubitimeWebhookBodySchema>;

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
