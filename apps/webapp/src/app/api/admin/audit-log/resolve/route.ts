/**
 * POST /api/admin/audit-log/resolve — вручную закрыть открытую строку `admin_audit_log` (`resolved_at`).
 * Допустимые `action`: auto_merge_conflict, auto_merge_conflict_anomaly, channel_link_ownership_conflict.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/app-layer/db/client";
import { resolveAdminAuditConflictById } from "@/app-layer/admin/auditLog";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

const bodySchema = z.object({
  id: z.string().uuid(),
});

export async function POST(req: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
  }

  const pool = getPool();
  const result = await resolveAdminAuditConflictById(pool, parsed.data.id);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, updated: true });
}
