/**
 * GET  /api/doctor/patients/[userId] — агрегат шапки карточки пациента.
 * PATCH /api/doctor/patients/[userId] — частичное обновление данных пациента.
 *   Поддерживаемые поля:
 *     { birthDate: string | null }  — ISO yyyy-mm-dd или null (сброс)
 *     { gender: 'male' | 'female' | null }  — пол или null (сброс)
 *     { displayName: string }  — отображаемое имя (непустое)
 *     { firstName: string | null, lastName: string | null }  — имя/фамилия или null (сброс)
 *
 * Response: { ok: true } | { ok: false, error: string }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const patchPatientSchema = z.object({
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date yyyy-mm-dd expected")
    .nullable()
    .optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  displayName: z.string().trim().min(1).max(200).optional(),
  firstName: z.string().trim().max(200).nullable().optional(),
  lastName: z.string().trim().max(200).nullable().optional(),
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
  const header = await deps.doctorClients.getPatientCardHeader(userId);

  if (!header) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, header });
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

  const parsed = patchPatientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation_error", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const deps = buildAppDeps();

  if ("birthDate" in parsed.data) {
    await deps.doctorClients.setPatientBirthDate(userId, parsed.data.birthDate ?? null);
  }

  if ("gender" in parsed.data) {
    await deps.doctorClients.setPatientGender(userId, parsed.data.gender ?? null);
  }

  const nameFields: { displayName?: string; firstName?: string | null; lastName?: string | null } = {};
  if ("displayName" in parsed.data) nameFields.displayName = parsed.data.displayName;
  if ("firstName" in parsed.data) nameFields.firstName = parsed.data.firstName ?? null;
  if ("lastName" in parsed.data) nameFields.lastName = parsed.data.lastName ?? null;
  if (Object.keys(nameFields).length > 0) {
    await deps.doctorClients.setPatientNames(userId, nameFields);
  }

  return NextResponse.json({ ok: true });
}
