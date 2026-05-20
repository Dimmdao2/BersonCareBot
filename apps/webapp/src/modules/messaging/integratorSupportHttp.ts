import { z } from "zod";

export const integratorSupportSyncUserMessageSchema = z.object({
  platformUserId: z.string().uuid(),
  integratorMessageId: z.string().min(1).max(200),
  text: z.string().min(1).max(4000),
  source: z.enum(["telegram", "max", "webapp"]),
  createdAt: z.string().min(1),
});

export const integratorSupportAdminReplySchema = z.object({
  integratorConversationId: z.string().min(1).max(200),
  integratorMessageId: z.string().min(1).max(200),
  text: z.string().min(1).max(4000),
  createdAt: z.string().min(1),
});

export type IntegratorSupportSyncUserMessageBody = z.infer<typeof integratorSupportSyncUserMessageSchema>;
export type IntegratorSupportAdminReplyBody = z.infer<typeof integratorSupportAdminReplySchema>;
