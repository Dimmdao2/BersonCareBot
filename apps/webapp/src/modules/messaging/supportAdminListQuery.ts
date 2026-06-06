import { z } from "zod";

/** Integrator GET /communication/conversations query params. */
export const integratorSupportConversationsQuerySchema = z.object({
  source: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type IntegratorSupportConversationsQuery = z.infer<typeof integratorSupportConversationsQuerySchema>;

/** Doctor GET /messages/conversations — unread filter only (limit fixed in route). */
export const doctorSupportConversationsQuerySchema = z.object({
  unread: z.enum(["0", "1"]).optional(),
});

export function doctorSupportUnreadOnlyFromQuery(unread: string | null | undefined): boolean {
  const parsed = doctorSupportConversationsQuerySchema.safeParse({
    unread: unread === "1" || unread === "0" ? unread : undefined,
  });
  if (!parsed.success) return false;
  return parsed.data.unread === "1";
}
