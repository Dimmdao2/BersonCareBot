/**
 * POST /api/admin/appointment-records/:integratorRecordId/soft-delete — пометить запись удалённой (admin only).
 */
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ integratorRecordId: string }> }
) {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { integratorRecordId } = await context.params;
  const id = integratorRecordId?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const ok = await deps.appointmentProjection.softDeleteByIntegratorId(id);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
