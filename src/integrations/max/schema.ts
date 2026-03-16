import { z } from 'zod';

/** MAX API: user reference in message/callback. */
const MaxUserSchema = z.object({
  user_id: z.number(),
  name: z.string().optional(),
  username: z.string().optional(),
}).passthrough();

/** MAX API: message object inside Update. */
const MaxMessageSchema = z.object({
  id: z.number().optional(),
  text: z.string().optional().nullable(),
  user_id: z.number().optional(),
  chat_id: z.number().optional(),
  from: MaxUserSchema.optional(),
  created_at: z.number().optional(),
}).passthrough();

/** MAX API: Update body sent to webhook (POST) or returned by GET /updates. */
export const MaxUpdateSchema = z.object({
  update_type: z.enum(['message_created', 'message_callback', 'bot_started']),
  timestamp: z.number(),
  message: MaxMessageSchema.optional().nullable(),
  user_locale: z.string().optional().nullable(),
  /** Present for message_callback: id to pass to POST /answers. */
  callback_id: z.string().optional(),
  /** For message_callback: payload from the button. */
  payload: z.string().optional(),
}).passthrough();

export type MaxUpdateValidated = z.infer<typeof MaxUpdateSchema>;
export type MaxMessageValidated = z.infer<typeof MaxMessageSchema>;

/**
 * Validates raw MAX webhook/long-polling body.
 */
export function parseMaxUpdate(raw: unknown): { success: true; data: MaxUpdateValidated } | { success: false; error: z.ZodError } {
  const result = MaxUpdateSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
