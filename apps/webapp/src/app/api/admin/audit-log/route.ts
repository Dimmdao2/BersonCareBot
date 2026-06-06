/**
 * GET /api/admin/audit-log — пагинированный журнал операций (admin_audit_log).
 * Guard: requireAdminModeSession() (admin + admin mode).
 */
import { NextResponse } from "next/server";
import { getPool } from "@/app-layer/db/client";
import { countOpenAutoMergeConflicts, listAdminAuditLog } from "@/app-layer/admin/auditLog";
import {
  adminAuditListFilterFromQuery,
  adminAuditListQuerySchema,
} from "@/modules/admin/adminAuditListQuery";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

export async function GET(req: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = adminAuditListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query", issues: parsed.error.flatten() }, { status: 400 });
  }

  const q = parsed.data;
  const filter = adminAuditListFilterFromQuery(q);
  if (filter.fromInclusive && filter.toInclusive && filter.fromInclusive > filter.toInclusive) {
    return NextResponse.json({ ok: false, error: "invalid_date_range" }, { status: 400 });
  }

  if (q.excludeSystemHealth && q.systemHealthOnly) {
    return NextResponse.json({ ok: false, error: "invalid_system_health_filter" }, { status: 400 });
  }

  const pool = getPool();
  const [result, openAutoMergeConflictCount] = await Promise.all([
    listAdminAuditLog(pool, {
      page: filter.page,
      limit: filter.limit,
      action: filter.action,
      targetId: filter.targetId,
      involvesPlatformUserId: filter.involvesPlatformUserId,
      status: filter.status,
      fromInclusive: filter.fromInclusive,
      toInclusive: filter.toInclusive,
      ...(filter.actionPrefix ? { actionPrefix: filter.actionPrefix } : {}),
      ...(filter.excludeActionPrefix ? { excludeActionPrefix: filter.excludeActionPrefix } : {}),
    }),
    countOpenAutoMergeConflicts(pool),
  ]);

  return NextResponse.json({ ok: true, ...result, openAutoMergeConflictCount });
}
