/**
 * GET /api/doctor/patients/[userId]/clinical
 * → { ok, state: ClinicalState, visits: Visit[] }
 *
 * Read-only проекция раздела «Карта»: актуальное состояние (активные жалобы с
 * severity+тренд, активные диагнозы) + история визитов. Запись — POST .../visits.
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
  const [state, visits] = await Promise.all([
    deps.patientClinical.getClinicalState(userId),
    deps.patientClinical.listVisits(userId),
  ]);

  return NextResponse.json({ ok: true, state, visits });
}
