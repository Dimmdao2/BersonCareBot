import { z } from 'zod';

const VkMessageSchema = z.object({
  id: z.number().optional(),
  conversation_message_id: z.number().optional(),
  from_id: z.number(),
  peer_id: z.number(),
  text: z.string().optional(),
  attachments: z.array(z.unknown()).optional(),
}).passthrough();

const VkMessageEventSchema = z.object({
  event_id: z.string().min(1),
  user_id: z.number(),
  peer_id: z.number(),
  payload: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  conversation_message_id: z.number().optional(),
}).passthrough();

export const VkCallbackSchema = z.object({
  type: z.enum(['confirmation', 'message_new', 'message_event']),
  secret: z.string().optional(),
  group_id: z.number().optional(),
  event_id: z.string().optional(),
  object: z.union([VkMessageSchema, VkMessageEventSchema]).optional(),
}).passthrough();

export type VkCallback = z.infer<typeof VkCallbackSchema>;
export type VkMessage = z.infer<typeof VkMessageSchema>;
export type VkMessageEvent = z.infer<typeof VkMessageEventSchema>;

export function parseVkCallback(raw: unknown):
  | { success: true; data: VkCallback }
  | { success: false; error: z.ZodError } {
  const result = VkCallbackSchema.safeParse(raw);
  return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
}
