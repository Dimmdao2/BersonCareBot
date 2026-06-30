/**
 * GET  /api/doctor/patients/[userId]/physical
 *   → { ok: true, heightCm: number | null, weightKg: number | null }
 *   Reads platform_users.height_cm, weight_kg WHERE id=$userId AND role='client'
 *   Auth: requireDoctorApiSession
 *
 * PATCH /api/doctor/patients/[userId]/physical
 *   Body: { heightCm?: number | null, weightKg?: number | null }
 *   Validates: heightCm 50–250 (integer), weightKg 10–500 (integer), both nullable
 *   Updates platform_users SET height_cm, weight_kg, updated_at=now() WHERE id=$userId
 *   → { ok: true }
 *   Auth: requireDoctorApiSession
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const patchSchema = z.object({
  heightCm: z
    .number()
    .int("Рост должен быть целым числом")
    .min(50, "Рост не может быть меньше 50 см")
    .max(250, "Рост не может быть больше 250 см")
    .nullable()
    .optional(),
  weightKg: z
    .number()
    .int("Вес должен быть целым числом")
    .min(10, "Вес не может быть меньше 10 кг")
    .max(500, "Вес не может быть больше 500 кг")
    .nullable()
    .optional(),
});

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
  const physical = await deps.doctorClients.getPatientPhysical(userId);

  if (!physical) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    heightCm: physical.heightCm,
    weightKg: physical.weightKg,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation_error", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const data = parsed.data;
  if (!("heightCm" in data) && !("weightKg" in data)) {
    return NextResponse.json({ ok: false, error: "no_fields_to_update" }, { status: 422 });
  }

  const deps = buildAppDeps();
  await deps.doctorClients.setPatientPhysical(userId, {
    ...(("heightCm" in data) && { heightCm: data.heightCm ?? null }),
    ...(("weightKg" in data) && { weightKg: data.weightKg ?? null }),
  });

  return NextResponse.json({ ok: true });
}
