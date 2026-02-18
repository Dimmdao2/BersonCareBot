import { z } from 'zod';

export const MailingPayloadSchema = z.object({
  mailing_id: z.number(),
  title: z.string(),
  content: z.string().optional(),
  status: z.enum(['pending', 'sent', 'failed']).optional(),
});

export type MailingPayload = z.infer<typeof MailingPayloadSchema>;
