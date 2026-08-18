/**
 * POST /api/doctor/clients — создать organization-owned клиента; #806 permits an explicit no-contact card.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { createDoctorClient } from '@/app-layer/doctor/createDoctorClient';
import {
  quotaLimitReachedRefusalMessage,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  FIO_LATIN_REJECTED_MESSAGE,
  FIO_LATIN_REJECTED_TEXT,
  isCyrillicFioInput,
  isCyrillicFioInputOrEmpty,
  isFioLatinRejection,
} from '@/shared/lib/fio';

const bodySchema = z.object({
  requestId: z.string().uuid().optional(),
  lastName: z
    .string()
    .min(1)
    .max(200)
    .refine(isCyrillicFioInput, { message: FIO_LATIN_REJECTED_MESSAGE }),
  firstName: z
    .string()
    .min(1)
    .max(200)
    .refine(isCyrillicFioInput, { message: FIO_LATIN_REJECTED_MESSAGE }),
  patronymic: z
    .string()
    .max(200)
    .refine(isCyrillicFioInputOrEmpty, { message: FIO_LATIN_REJECTED_MESSAGE })
    .nullable()
    .optional(),
  phone: z.string().max(100).nullable().optional(),
  email: z.string().max(320).nullable().optional(),
});

export async function POST(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'patient_count');
  if (!entitlement.ok) return entitlement.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_body',
        ...(isFioLatinRejection(parsed) ? { message: FIO_LATIN_REJECTED_TEXT } : {}),
      },
      { status: 400 },
    );
  }
  const noContact = !parsed.data.phone?.trim() && !parsed.data.email?.trim();
  if (noContact && !parsed.data.requestId) {
    return NextResponse.json({ ok: false, error: 'invalid_request_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const patientOrganization = deps.patientOrganization;
  if (!patientOrganization) {
    return NextResponse.json({ ok: false, error: 'client_creation_unavailable' }, { status: 503 });
  }

  const result = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.clients.create', () =>
    createDoctorClient(
      {
        organizationId: gate.ctx.organizationId,
        specialistId: gate.ctx.specialistId,
        requestId: parsed.data.requestId,
        createdByUserId: gate.ctx.session.user.userId,
        lastName: parsed.data.lastName,
        firstName: parsed.data.firstName,
        patronymic: parsed.data.patronymic,
        phone: parsed.data.phone,
        email: parsed.data.email,
      },
      {
        patientOrganization,
        emailSetupAccess: deps.emailSetupAccess,
      },
    ),
  );

  if (!result.ok) {
    const status =
      result.error === 'email_conflict'
        ? 409
        : result.error === 'patient_count_limit_reached'
          ? 403
          : result.error.startsWith('invalid_')
            ? 400
            : 409;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        // Owner 18.08 (L-1): the patient ceiling is the one refusal left for a limit-bearing
        // mechanic, so it reaches the screen as a sentence instead of `patient_count_limit_reached`.
        ...(result.error === 'patient_count_limit_reached'
          ? {
              mechanic: 'patient_count',
              message: quotaLimitReachedRefusalMessage('patient_count', 'создать пациента'),
            }
          : {}),
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    client: {
      id: result.userId,
      displayName: result.displayName,
      firstName: result.firstName,
      lastName: result.lastName,
      patronymic: result.patronymic,
      phone: result.phoneNormalized,
    },
    created: result.created,
    emailSetupEnqueued: result.emailSetupEnqueued,
  });
}
