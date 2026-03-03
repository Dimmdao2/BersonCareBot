import { z } from 'zod';

/** Базовая схема пользователя Telegram. */
const FromSchema = z.object({
  id: z.number(),
  is_bot: z.boolean().optional(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  language_code: z.string().optional(),
});

/** Базовая схема Telegram-чата. */
const ChatSchema = z.object({ id: z.number() }).passthrough();

/** Схема входящего Telegram-message payload. */
const MessageSchema = z.object({
  message_id: z.number().optional(),
  text: z.string().optional(),
  from: FromSchema.optional(),
  chat: ChatSchema.optional(),
  contact: z.object({
    phone_number: z.string(),
    user_id: z.number().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }).optional(),
}).passthrough();

/** Схема входящего callback_query payload. */
const CallbackQuerySchema = z.object({
  id: z.string(),
  from: FromSchema,
  data: z.string().optional(),
  message: MessageSchema.optional(),
}).passthrough();

/** Схема body Telegram webhook. */
export const TelegramWebhookBodySchema = z.object({
  update_id: z.number().optional(),
  message: MessageSchema.optional(),
  callback_query: CallbackQuerySchema.optional(),
}).passthrough();

/** Валидированный тип Telegram webhook body. */
export type TelegramWebhookBodyValidated = z.infer<typeof TelegramWebhookBodySchema>;

/**
 * Валидирует сырой Telegram webhook body.
 * Возвращает discriminated-union с `success`.
 */
export function parseWebhookBody(raw: unknown): { success: true; data: TelegramWebhookBodyValidated } | { success: false; error: z.ZodError } {
  const result = TelegramWebhookBodySchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
