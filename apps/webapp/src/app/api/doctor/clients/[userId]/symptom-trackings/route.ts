/**
 * POST /api/doctor/clients/:userId/symptom-trackings — создать отслеживание симптома для пациента (staff).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { logger, serializeError } from '@/infra/logging/logger';
import { isSystemWellbeingTracking } from '@/modules/patient-mood/wellbeingConstants';
import {
  patientSymptomTrackingDefaultForMode,
  resolvePatientSymptomTrackingDefault,
} from '@/app-layer/doctor/patientSymptomTrackingVisibility';

const postBodySchema = z.object({
  symptomTitle: z.string().min(1).max(200),
  symptomTypeRefId: z.string().uuid().nullable().optional(),
  regionRefId: z.string().uuid().nullable().optional(),
  side: z.enum(['left', 'right', 'both']).nullable().optional(),
  diagnosisText: z.string().max(500).nullable().optional(),
  diagnosisRefId: z.string().uuid().nullable().optional(),
  stageRefId: z.string().uuid().nullable().optional(),
  patientTrackingEnabled: z.boolean().optional(),
});

const patchBodySchema = z.object({
  trackingId: z.string().uuid(),
  patientTrackingEnabled: z.boolean(),
});

async function resolvePatient(
  gate: Awaited<ReturnType<typeof requireDoctorWorkspaceApiContext>>,
  userId: string,
) {
  if (!gate.ok) return null;
  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  return identity ? { deps, identity } : null;
}

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }
  const patient = await resolvePatient(gate, userId);
  if (!patient) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const [trackings, defaults, support] = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    Promise.all([
      patient.deps.diaries.listSymptomTrackings(userId, false),
      patient.deps.systemSettings.getDoctorWorkspaceClientDefaults({
        organizationId: gate.ctx.organizationId,
      }),
      patient.deps.doctorClients.getClientSupport(userId, gate.ctx.organizationId),
    ]),
  );
  return NextResponse.json({
    ok: true,
    trackings: trackings
      .filter(
        (tracking) =>
          tracking.organizationId === gate.ctx.organizationId &&
          !isSystemWellbeingTracking(tracking.symptomKey),
      )
      .map((tracking) => ({
        id: tracking.id,
        symptomTitle: tracking.symptomTitle,
        isActive: tracking.isActive,
        patientTrackingEnabled: tracking.patientTrackingEnabled,
      })),
    createDefault: patientSymptomTrackingDefaultForMode(
      defaults.patientSymptomTrackingDefault,
      support?.onSupport === true,
    ),
  });
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const patient = await resolvePatient(gate, userId);
  if (!patient) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const patientTrackingEnabled =
    parsed.data.patientTrackingEnabled ??
    (await withDoctorWorkspacePrincipal(gate.ctx, () =>
      resolvePatientSymptomTrackingDefault(patient.deps, {
        organizationId: gate.ctx.organizationId,
        patientUserId: userId,
      }),
    ));

  try {
    const tracking = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      patient.deps.diaries.createSymptomTracking({
        userId,
        symptomTitle: parsed.data.symptomTitle.trim(),
        symptomTypeRefId: parsed.data.symptomTypeRefId ?? null,
        regionRefId: parsed.data.regionRefId ?? null,
        side: parsed.data.side ?? null,
        diagnosisText: parsed.data.diagnosisText?.trim() ? parsed.data.diagnosisText.trim() : null,
        diagnosisRefId: parsed.data.diagnosisRefId ?? null,
        stageRefId: parsed.data.stageRefId ?? null,
        patientTrackingEnabled,
      }),
    );
    return NextResponse.json({
      ok: true,
      tracking: {
        id: tracking.id,
        symptomTitle: tracking.symptomTitle,
        symptomKey: tracking.symptomKey,
        patientTrackingEnabled: tracking.patientTrackingEnabled,
      },
    });
  } catch (e) {
    logger.error({ err: serializeError(e) }, 'doctor symptom-tracking create failed');
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }
  const parsed = patchBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  const patient = await resolvePatient(gate, userId);
  if (!patient) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const tracking = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    patient.deps.diaries.getSymptomTrackingForUser({ userId, trackingId: parsed.data.trackingId }),
  );
  if (
    !tracking ||
    tracking.organizationId !== gate.ctx.organizationId ||
    isSystemWellbeingTracking(tracking.symptomKey)
  ) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  await withDoctorWorkspacePrincipal(gate.ctx, () =>
    patient.deps.diaries.setPatientTrackingEnabled({
      userId,
      trackingId: tracking.id,
      patientTrackingEnabled: parsed.data.patientTrackingEnabled,
    }),
  );
  return NextResponse.json({ ok: true });
}
