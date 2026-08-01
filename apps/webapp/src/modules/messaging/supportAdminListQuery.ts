import { z } from 'zod';

/** Doctor GET /messages/conversations — unread filter only (limit fixed in route). */
export const doctorSupportConversationsQuerySchema = z.object({
  unread: z.enum(['0', '1']).optional(),
});

export function doctorSupportUnreadOnlyFromQuery(unread: string | null | undefined): boolean {
  const parsed = doctorSupportConversationsQuerySchema.safeParse({
    unread: unread === '1' || unread === '0' ? unread : undefined,
  });
  if (!parsed.success) return false;
  return parsed.data.unread === '1';
}
