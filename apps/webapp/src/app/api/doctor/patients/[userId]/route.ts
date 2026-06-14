/**
 * GET /api/doctor/patients/[userId] — агрегат шапки карточки пациента.
 *
 * Response: { header: PatientCardHeader } | { error: string }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const header = await deps.doctorClients.getPatientCardHeader(userId);

  if (!header) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, header });
}
