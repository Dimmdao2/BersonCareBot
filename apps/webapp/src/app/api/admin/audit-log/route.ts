/**
 * GET /api/admin/audit-log — пагинированный журнал операций (admin_audit_log).
 * Guard: requireAdminModeSession() (admin + admin mode).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/app-layer/db/client";
import { countOpenAutoMergeConflicts, listAdminAuditLog } from "@/app-layer/admin/auditLog";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().max(256).optional(),
  target: z.string().max(512).optional(),
  /** Filter: `target_id` match or `auto_merge_conflict.details.candidateIds` contains this UUID. */
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
});

function dayStartUtcIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function dayEndUtcIso(date: string): string {
  return `${date}T23:59:59.999Z`;
}

export async function GET(req: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query", issues: parsed.error.flatten() }, { status: 400 });
  }

  const q = parsed.data;
  let fromInclusive: string | undefined;
  let toInclusive: string | undefined;
  if (q.from) fromInclusive = dayStartUtcIso(q.from);
  if (q.to) toInclusive = dayEndUtcIso(q.to);
  if (fromInclusive && toInclusive && fromInclusive > toInclusive) {
    return NextResponse.json({ ok: false, error: "invalid_date_range" }, { status: 400 });
  }

  const pool = getPool();
  const [result, openAutoMergeConflictCount] = await Promise.all([
    listAdminAuditLog(pool, {
      page: q.page,
      limit: q.limit,
      action: q.action,
      targetId: q.target,
      involvesPlatformUserId: q.involvesPlatformUserId,
      status: q.status,
      fromInclusive,
      toInclusive,
    }),
    countOpenAutoMergeConflicts(pool),
  ]);

  return NextResponse.json({ ok: true, ...result, openAutoMergeConflictCount });
}
