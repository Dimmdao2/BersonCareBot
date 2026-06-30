/**
 * GET /api/doctor/comments/patients/:patientUserId/exercises
 *
 * Упражнения выбранного пациента с комментариями, сгруппированные по этапам (state B drill-down).
 * Используется клиентским компонентом DoctorCommentsTab при выборе пациента слева.
 *
 * Query params:
 *   includePastPrograms — "true" для включения прошлых программ (по умолчанию — только активная).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { loadDoctorPatientExercisesWithComments } from "@/app/app/doctor/comments/loadDoctorPatientExercisesWithComments";

const uuidSchema = z.string().uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ patientUserId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { patientUserId } = await context.params;
  if (!uuidSchema.safeParse(patientUserId).success) {
    return NextResponse.json({ ok: false, error: "invalid_patient_id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const includePastPrograms = searchParams.get("includePastPrograms") === "true";

  const deps = buildAppDeps();
  const result = await loadDoctorPatientExercisesWithComments(
    {
      treatmentProgramInstance: deps.treatmentProgramInstance,
      programItemDiscussion: deps.programItemDiscussion,
    },
    {
      patientUserId,
      viewerUserId: auth.session.user.userId,
    },
    { includePastPrograms },
  );

  if (!result) {
    return NextResponse.json({ ok: true, data: null });
  }

  return NextResponse.json({ ok: true, data: result });
}
