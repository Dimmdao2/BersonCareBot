/**
 * POST /api/doctor/patients/[userId]/visits  → { ok, visitId }
 *
 * Создаёт визит (первичный/повторный) транзакционно вместе с жалобами/диагнозами
 * (первичный) либо обновлениями жалоб/диагнозов (повторный). См. NewVisitPanel.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const severitySchema = z.number().int().min(0).max(10);

const createVisitBodySchema = z.object({
  visitType: z.enum(['first', 'repeat']),
  date: z.string().min(1), // ISO datetime or date string
  location: z.string().max(500).optional(),
  service: z.string().max(500).optional(),
  duration: z.string().max(100).optional(),
  anamnesisText: z.string().max(20000).optional(),
  canonicalAppointmentId: z.string().uuid().optional(),
  exam: z.string().max(20000).optional(),
  manipulations: z.string().max(20000).optional(),
  trialResults: z.string().max(20000).optional(),
  recommendations: z.string().max(20000).optional(),
  complaints: z
    .array(
      z.object({
        text: z.string().min(1).max(2000),
        description: z.string().max(20000).optional(),
        priority: z.boolean(),
        severity: severitySchema,
      }),
    )
    .optional(),
  diagnoses: z
    .array(
      z.object({
        text: z.string().min(1).max(2000),
        priority: z.boolean(),
        catalogId: z.string().uuid().optional(),
        comment: z.string().max(20000).optional(),
      }),
    )
    .optional(),
  complaintUpdates: z
    .array(
      z.object({
        complaintId: z.string().uuid(),
        note: z.string().max(20000),
        severity: severitySchema,
        resolved: z.boolean(),
      }),
    )
    .optional(),
  diagnosisUpdates: z
    .array(
      z.object({
        diagnosisId: z.string().uuid(),
        refinement: z.string().max(20000).optional(),
        removed: z.boolean(),
      }),
    )
    .optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = createVisitBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const patientUserId = identity.userId;

  let visitId: string;
  try {
    visitId = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.patientClinical.createVisit({
        patientUserId,
        visitType: b.visitType,
        visitedAt: b.date,
        location: b.location ?? null,
        service: b.service ?? null,
        duration: b.duration ?? null,
        anamnesisText: b.anamnesisText ?? null,
        canonicalAppointmentId: b.canonicalAppointmentId ?? null,
        exam: b.exam ?? null,
        manipulations: b.manipulations ?? null,
        trialResults: b.trialResults ?? null,
        recommendations: b.recommendations ?? null,
        createdBy: gate.ctx.session.user.userId,
        complaints: b.complaints,
        diagnoses: b.diagnoses,
        complaintUpdates: b.complaintUpdates,
        diagnosisUpdates: b.diagnosisUpdates,
      }),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'clinical_target_not_found' ||
        error.message === 'organization_principal_mismatch')
    ) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true, visitId }, { status: 201 });
}
