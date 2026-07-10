/**
 * POST /api/admin/appointment-records/:integratorRecordId/soft-delete — пометить запись удалённой
 * (admin с резолвленным admin-workspace членством, SAAS Hole#3 taskdb `#645`).
 * Пишет `appointment_records.deleted_at` и при совпадении `patient_bookings.rubitime_id` отменяет активные статусы
 * (чтобы запись ушла из кабинета пациента). `appointmentProjection.softDeleteByIntegratorId` получает
 * `organizationId` вызывающей workspace и отказывает в удалении, если запись резолвится в чужую
 * каноническую организацию (см. `pgAppointmentProjection.ts`).
 */
import { NextResponse } from "next/server";
import { emitBookingDeletedEvent } from "@/app-layer/booking/emitBookingDeletedEvent";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { withDoctorWorkspacePrincipal } from "@/app-layer/principal/withOrganizationPrincipal";

export async function POST(
  _request: Request,
  context: { params: Promise<{ integratorRecordId: string }> }
) {
  const gate = await requireAdminWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { integratorRecordId } = await context.params;
  const id = integratorRecordId?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const ok = await withDoctorWorkspacePrincipal(gate.ctx, "admin.appointment-records.soft-delete", () =>
    deps.appointmentProjection.softDeleteByIntegratorId(id, { organizationId: gate.ctx.organizationId }),
  );
  if (!ok) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    await emitBookingDeletedEvent({ deps, integratorRecordId: id });
  } catch {
    // GCal delete is best-effort after local soft-delete.
  }

  return NextResponse.json({ ok: true });
}
