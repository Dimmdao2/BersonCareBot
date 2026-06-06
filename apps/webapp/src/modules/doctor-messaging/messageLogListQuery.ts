import { z } from "zod";
import type { MessageLogListFilters, MessageLogListParams } from "./ports";

export const messageLogListFiltersSchema = z.object({
  userId: z.string().uuid().optional(),
  category: z.string().max(100).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

/** Normalize list params at service boundary (clamp + Zod filters). */
export function normalizeMessageLogListParams(params?: MessageLogListParams): Required<
  Pick<MessageLogListParams, "page" | "pageSize">
> & {
  filters: MessageLogListFilters;
} {
  const page = Math.max(1, Math.floor(params?.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params?.pageSize ?? 20)));
  const raw = { ...(params?.filters ?? {}) };
  const uid = raw.userId?.trim();
  if (uid && !z.string().uuid().safeParse(uid).success) {
    delete raw.userId;
  }
  const parsed = messageLogListFiltersSchema.safeParse(raw);
  const filters: MessageLogListFilters = parsed.success ? parsed.data : {};
  return { page, pageSize, filters };
}
