import { z } from "zod";

/** GET /api/admin/audit-log query params. */
export const adminAuditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().max(256).optional(),
  target: z.string().max(512).optional(),
  /** Filter: `target_id` match or merge-conflict `details.candidateIds`. */
  involvesPlatformUserId: z.string().uuid().optional(),
  status: z.enum(["ok", "partial_failure", "error"]).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  excludeSystemHealth: z
    .enum(["1", "true"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  systemHealthOnly: z
    .enum(["1", "true"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export type AdminAuditListQuery = z.infer<typeof adminAuditListQuerySchema>;

export function adminAuditDayStartUtcIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

export function adminAuditDayEndUtcIso(date: string): string {
  return `${date}T23:59:59.999Z`;
}

export function adminAuditListFilterFromQuery(q: AdminAuditListQuery) {
  let fromInclusive: string | undefined;
  let toInclusive: string | undefined;
  if (q.from) fromInclusive = adminAuditDayStartUtcIso(q.from);
  if (q.to) toInclusive = adminAuditDayEndUtcIso(q.to);

  return {
    page: q.page,
    limit: q.limit,
    action: q.action,
    targetId: q.target,
    involvesPlatformUserId: q.involvesPlatformUserId,
    status: q.status,
    fromInclusive,
    toInclusive,
    ...(q.systemHealthOnly
      ? { actionPrefix: "system_health_" as const }
      : q.excludeSystemHealth
        ? { excludeActionPrefix: "system_health_" as const }
        : {}),
  };
}
