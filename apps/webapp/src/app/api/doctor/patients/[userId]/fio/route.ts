/**
 * PATCH /api/doctor/patients/[userId]/fio
 *
 * Update patient FIO fields (Фамилия / Имя / Отчество), displayName, birthDate, and gender.
 * Accepts: { firstName, lastName, patronymic, displayName, birthDate, gender }
 * All fields optional and nullable. At least one must be provided.
 *
 * Response: { ok: true } | { ok: false, error: string }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/principal/withOrganizationPrincipal";

const bodySchema = z.object({
  firstName: z.string().trim().max(200).nullable().optional(),
  lastName: z.string().trim().max(200).nullable().optional(),
  patronymic: z.string().trim().max(200).nullable().optional(),
  displayName: z.string().trim().min(1).max(200).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation_error", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const nameFields: {
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    patronymic?: string | null;
  } = {};

  if ("displayName" in data && data.displayName !== undefined) nameFields.displayName = data.displayName;
  if ("firstName" in data) nameFields.firstName = data.firstName ?? null;
  if ("lastName" in data) nameFields.lastName = data.lastName ?? null;
  if ("patronymic" in data) nameFields.patronymic = data.patronymic ?? null;

  const hasBirthDate = "birthDate" in data;
  const hasGender = "gender" in data;

  if (Object.keys(nameFields).length === 0 && !hasBirthDate && !hasGender) {
    return NextResponse.json({ ok: false, error: "no_fields_to_update" }, { status: 422 });
  }

  const deps = buildAppDeps();

  await withDoctorWorkspacePrincipal(gate.ctx, "doctor.patients.fio.update", async () => {
    if (Object.keys(nameFields).length > 0) {
      await deps.doctorClients.setPatientNames(userId, nameFields);
    }

    if (hasBirthDate) {
      await deps.doctorClients.setPatientBirthDate(userId, data.birthDate ?? null);
    }

    if (hasGender) {
      await deps.doctorClients.setPatientGender(userId, data.gender ?? null);
    }
  });

  return NextResponse.json({ ok: true });
}
