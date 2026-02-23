import { z } from 'zod';

const FromSchema = z.object({
  id: z.number(),
  is_bot: z.boolean().optional(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  language_code: z.string().optional(),
});

const ChatSchema = z.object({ id: z.number() }).passthrough();
const MessageSchema = z.object({
  message_id: z.number().optional(),
  text: z.string().optional(),
  from: FromSchema.optional(),
  chat: ChatSchema.optional(),
}).passthrough();
const CallbackQuerySchema = z.object({
  id: z.string(),
  from: FromSchema,
  data: z.string().optional(),
  message: MessageSchema.optional(),
}).passthrough();

export const TelegramWebhookBodySchema = z.object({
  update_id: z.number().optional(),
  message: MessageSchema.optional(),
  callback_query: CallbackQuerySchema.optional(),
}).passthrough();

export type TelegramWebhookBodyValidated = z.infer<typeof TelegramWebhookBodySchema>;

export function parseWebhookBody(raw: unknown): { success: true; data: TelegramWebhookBodyValidated } | { success: false; error: z.ZodError } {
  const result = TelegramWebhookBodySchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
