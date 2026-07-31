import { z } from 'zod';

export const integratorSupportSyncUserMessageSchema = z.object({
  platformUserId: z.string().uuid(),
  integratorMessageId: z.string().min(1).max(200),
  text: z.string().min(1).max(4000),
  source: z.enum(['telegram', 'max', 'webapp']),
  createdAt: z.string().min(1),
  externalChatId: z.string().max(500).nullable().optional(),
  externalMessageId: z.string().max(500).nullable().optional(),
});

export const integratorSupportAdminReplySchema = z.object({
  integratorConversationId: z.string().min(1).max(200),
  integratorMessageId: z.string().min(1).max(200),
  text: z.string().min(1).max(4000),
  senderDisplayName: z.string().min(1).max(500).optional(),
  createdAt: z.string().min(1),
  programNoteStageItemId: z.string().uuid().optional(),
});

export const integratorSupportStatusSchema = z.object({
  integratorConversationId: z.string().min(1).max(200),
  status: z.enum(['open', 'closed']),
  lastMessageAt: z.string().min(1).nullable().optional(),
  closedAt: z.string().min(1).nullable().optional(),
  closeReason: z.string().max(500).nullable().optional(),
});

const integratorSupportQuestionBaseSchema = z.object({
  integratorConversationId: z.string().min(1).max(200),
  integratorQuestionId: z.string().min(1).max(200),
  organizationId: z.string().uuid().optional(),
});

export const integratorSupportQuestionWriteSchema = z.discriminatedUnion('operation', [
  integratorSupportQuestionBaseSchema.extend({
    operation: z.literal('create'),
    status: z.string().min(1).max(100).default('open'),
    createdAt: z.string().min(1),
  }),
  integratorSupportQuestionBaseSchema.extend({
    operation: z.literal('message'),
    integratorQuestionMessageId: z.string().min(1).max(200),
    senderRole: z.enum(['user', 'admin']),
    text: z.string().min(1).max(4000),
    createdAt: z.string().min(1),
  }),
  integratorSupportQuestionBaseSchema.extend({
    operation: z.literal('answered'),
    answeredAt: z.string().min(1),
  }),
]);

export const integratorSupportDeliveryAttemptWriteSchema = z.object({
  organizationId: z.string().uuid(),
  integratorIntentEventId: z.string().max(500).nullable(),
  correlationId: z.string().max(500).nullable(),
  channelCode: z.string().min(1).max(100),
  status: z.string().min(1).max(100),
  attempt: z.number().int().positive(),
  reason: z.string().max(1000).nullable(),
  payloadJson: z.record(z.string(), z.unknown()),
  occurredAt: z.string().min(1),
});

export type IntegratorSupportSyncUserMessageBody = z.infer<
  typeof integratorSupportSyncUserMessageSchema
>;
export type IntegratorSupportAdminReplyBody = z.infer<typeof integratorSupportAdminReplySchema>;
export type IntegratorSupportStatusBody = z.infer<typeof integratorSupportStatusSchema>;
export type IntegratorSupportQuestionWriteBody = z.infer<
  typeof integratorSupportQuestionWriteSchema
>;
export type IntegratorSupportDeliveryAttemptWriteBody = z.infer<
  typeof integratorSupportDeliveryAttemptWriteSchema
>;
