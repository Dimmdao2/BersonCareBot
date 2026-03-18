import { z } from 'zod';

/**
 * MAX API real webhook payload (see dev.max.ru, MAX_API_Real_Payloads_2026).
 * Text is at message.body.text; sender at message.sender; chat at message.recipient.
 * For message_callback: callback.callback_id, callback.payload, callback.user.
 */
const MaxUserSchema = z.object({
  user_id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  name: z.string().optional(),
  username: z.string().optional(),
  is_bot: z.boolean().optional(),
}).passthrough();

const MaxMessageBodySchema = z.object({
  mid: z.string().optional(),
  seq: z.number().optional(),
  text: z.string().optional().nullable(),
  attachments: z.array(z.unknown()).optional(),
}).passthrough();

const MaxRecipientSchema = z.object({
  chat_id: z.number(),
  chat_type: z.string().optional(),
  user_id: z.number().optional(),
}).passthrough();

const MaxMessageSchema = z.object({
  recipient: MaxRecipientSchema.optional(),
  body: MaxMessageBodySchema.optional(),
  sender: MaxUserSchema.optional(),
  timestamp: z.number().optional(),
}).passthrough();

const MaxCallbackSchema = z.object({
  callback_id: z.string(),
  payload: z.string().optional(),
  user: MaxUserSchema.optional(),
  timestamp: z.number().optional(),
}).passthrough();

/** MAX API: Update body sent to webhook (POST) or returned by GET /updates. */
export const MaxUpdateSchema = z.object({
  update_type: z.enum(['message_created', 'message_callback', 'bot_started', 'user_added']),
  timestamp: z.number(),
  message: MaxMessageSchema.optional().nullable(),
  callback: MaxCallbackSchema.optional(),
  user_locale: z.string().optional().nullable(),
  chat_id: z.number().optional(),
  user: MaxUserSchema.optional(),
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
