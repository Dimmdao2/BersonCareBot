import { z } from 'zod';

export const TelegramWebhookSchema = z.object({
  message: z.object({
    text: z.string().optional(),
    from: z.object({
      id: z.number(),
      username: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      phone: z.string().optional(),
      language_code: z.string().optional(),
      is_bot: z.boolean().optional(),
    }).optional(),
    chat: z.object({
      id: z.number(),
    }).optional(),
  }).optional(),
});

export type TelegramWebhookPayload = z.infer<typeof TelegramWebhookSchema>;
