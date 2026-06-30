/**
 * PATCH /api/doctor/patients/[userId]/visits/[visitId] → { ok }
 *
 * Инлайн-правка текстовых полей визита (осмотр/манипуляции/пробы/рекомендации/локация/
 * длительность). Пустая строка очищает поле. Жалобы/диагнозы/динамику визита не трогает.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const bodySchema = z
  .object({
    location: z.string().max(500).optional(),
    duration: z.string().max(100).optional(),
    exam: z.string().max(20000).optional(),
    manipulations: z.string().max(20000).optional(),
    trialResults: z.string().max(20000).optional(),
    recommendations: z.string().max(20000).optional(),
  })
  .refine(
    (b) =>
      b.location !== undefined ||
      b.duration !== undefined ||
      b.exam !== undefined ||
      b.manipulations !== undefined ||
      b.trialResults !== undefined ||
      b.recommendations !== undefined,
    { message: "nothing_to_update" },
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string; visitId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId, visitId } = await params;
  if (
    !z.string().uuid().safeParse(userId).success ||
    !z.string().uuid().safeParse(visitId).success
  ) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  const ok = await deps.patientClinical.updateVisitFields({
    patientUserId: userId,
    visitId,
    ...parsed.data,
  });
  if (!ok) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
