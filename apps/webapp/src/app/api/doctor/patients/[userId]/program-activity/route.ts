/**
 * GET /api/doctor/patients/[userId]/program-activity
 *   → { ok, activity: DoctorPatientProgramActivity }
 *
 * Виджет «Программа и комментарии» на вкладке «Обзор» карточки пациента:
 * последняя отметка пациента по программе + число упражнений с непрочитанными отметками.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { loadDoctorPatientProgramActivity } from "@/app/app/doctor/patients/loadDoctorPatientProgramActivity";

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
  const activity = await loadDoctorPatientProgramActivity(
    { programItemDiscussion: deps.programItemDiscussion },
    { patientUserId: userId, viewerUserId: auth.session.user.userId },
  );

  return NextResponse.json({ ok: true, activity });
}
