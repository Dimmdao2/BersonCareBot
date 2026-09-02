import { z } from 'zod';

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

export type IntegratorSupportStatusBody = z.infer<typeof integratorSupportStatusSchema>;
export type IntegratorSupportQuestionWriteBody = z.infer<
  typeof integratorSupportQuestionWriteSchema
>;
