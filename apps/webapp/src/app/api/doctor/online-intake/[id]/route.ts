import { NextResponse } from "next/server";
import { getPool } from "@/infra/db/client";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { buildDoctorOnlineIntakeDetailResponse } from "@/modules/online-intake/doctorIntakeDetailResponse";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const service = getOnlineIntakeService();
  const result = await service.getRequestForDoctor(id);
  if (!result) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const pool = getPool();
  const { rows } = await pool.query<{ display_name: string | null; phone_normalized: string | null }>(
    `SELECT display_name, phone_normalized FROM platform_users WHERE id = $1::uuid`,
    [result.userId],
  );
  const patientDisplay = {
    patientName: rows[0]?.display_name ?? "",
    patientPhone: rows[0]?.phone_normalized ?? "",
  };

  const json = await buildDoctorOnlineIntakeDetailResponse(result, patientDisplay);
  return NextResponse.json(json);
}
