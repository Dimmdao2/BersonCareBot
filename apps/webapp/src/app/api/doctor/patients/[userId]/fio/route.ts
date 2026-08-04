/**
 * PATCH /api/doctor/patients/[userId]/fio
 *
 * Update patient FIO fields (Фамилия / Имя / Отчество), birthDate, and gender.
 * The compatibility display label is derived by the repository from structured FIO.
 * Accepts: { firstName, lastName, patronymic, birthDate, gender }
 * All fields optional and nullable. At least one must be provided.
 *
 * Response: { ok: true } | { ok: false, error: string }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  FIO_LATIN_REJECTED_MESSAGE,
  FIO_LATIN_REJECTED_TEXT,
  isCyrillicFioInputOrEmpty,
  isFioLatinRejection,
  normalizeFioPart,
} from '@/shared/lib/fio';

const bodySchema = z.object({
  firstName: z
    .string()
    .trim()
    .max(200)
    .refine(isCyrillicFioInputOrEmpty, { message: FIO_LATIN_REJECTED_MESSAGE })
    .nullable()
    .optional(),
  lastName: z
    .string()
    .trim()
    .max(200)
    .refine(isCyrillicFioInputOrEmpty, { message: FIO_LATIN_REJECTED_MESSAGE })
    .nullable()
    .optional(),
  patronymic: z
    .string()
    .trim()
    .max(200)
    .refine(isCyrillicFioInputOrEmpty, { message: FIO_LATIN_REJECTED_MESSAGE })
    .nullable()
    .optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'validation_error',
        issues: parsed.error.issues,
        ...(isFioLatinRejection(parsed) ? { message: FIO_LATIN_REJECTED_TEXT } : {}),
      },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const nameFields: {
    firstName?: string | null;
    lastName?: string | null;
    patronymic?: string | null;
  } = {};

  if ('firstName' in data) nameFields.firstName = normalizeFioPart(data.firstName) ?? null;
  if ('lastName' in data) nameFields.lastName = normalizeFioPart(data.lastName) ?? null;
  if ('patronymic' in data) nameFields.patronymic = normalizeFioPart(data.patronymic) ?? null;

  const hasBirthDate = 'birthDate' in data;
  const hasGender = 'gender' in data;

  if (Object.keys(nameFields).length === 0 && !hasBirthDate && !hasGender) {
    return NextResponse.json({ ok: false, error: 'no_fields_to_update' }, { status: 422 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const patientUserId = identity.userId;

  await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.patients.fio.update', async () => {
    if (Object.keys(nameFields).length > 0) {
      await deps.doctorClients.setPatientNames(patientUserId, nameFields);
    }

    if (hasBirthDate) {
      await deps.doctorClients.setPatientBirthDate(patientUserId, data.birthDate ?? null);
    }

    if (hasGender) {
      await deps.doctorClients.setPatientGender(patientUserId, data.gender ?? null);
    }
  });

  return NextResponse.json({ ok: true });
}
