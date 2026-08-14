/**
 * GET  /api/doctor/patients/[userId]/anamnesis → { ok, anamnesis: AnamnesisState }
 * POST /api/doctor/patients/[userId]/anamnesis → append an entry to one of three sections.
 *
 * Секция указывается через поле `section` в теле запроса:
 *   "trauma"    → добавить запись «Травмы и операции»
 *   "illness"   → добавить запись «Болезни, стрессы»
 *   "lifestyle" → добавить запись «Образ жизни»
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

// -- Request body schemas ----------------------------------------------------

const appendTraumaSchema = z.object({
  section: z.literal('trauma'),
  year: z.string().min(1).max(100),
  what: z.string().min(1).max(1000),
  type: z.string().min(1).max(200),
  immobilization: z.string().max(500).default('—'),
});

const appendIllnessSchema = z.object({
  section: z.literal('illness'),
  period: z.string().min(1).max(100),
  what: z.string().min(1).max(1000),
  comment: z.string().max(2000).default(''),
});

const appendLifestyleSchema = z.object({
  section: z.literal('lifestyle'),
  /** ISO date string, e.g. "2026-01-18". */
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  text: z.string().min(1).max(5000),
});

const appendAnamnesisBodySchema = z.discriminatedUnion('section', [
  appendTraumaSchema,
  appendIllnessSchema,
  appendLifestyleSchema,
]);

// -- Handlers ----------------------------------------------------------------

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const patientUserId = identity.userId;

  const anamnesis = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.patientClinical.getAnamnesis(patientUserId),
  );
  return NextResponse.json({ ok: true, anamnesis });
}

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

  const parsed = appendAnamnesisBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const createdBy = gate.ctx.session.user.userId;

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const patientUserId = identity.userId;

  if (b.section === 'trauma') {
    const entry = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor.patients.clinical.anamnesis.trauma.create',
      () =>
        deps.patientClinical.appendAnamnesisTrauma({
          patientUserId,
          year: b.year,
          what: b.what,
          type: b.type,
          immobilization: b.immobilization,
          createdBy,
        }),
    );
    return NextResponse.json({ ok: true, entry }, { status: 201 });
  }

  if (b.section === 'illness') {
    const entry = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor.patients.clinical.anamnesis.illness.create',
      () =>
        deps.patientClinical.appendAnamnesisIllness({
          patientUserId,
          period: b.period,
          what: b.what,
          comment: b.comment,
          createdBy,
        }),
    );
    return NextResponse.json({ ok: true, entry }, { status: 201 });
  }

  // section === "lifestyle"
  const entry = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.patients.clinical.anamnesis.lifestyle.create',
    () =>
      deps.patientClinical.appendAnamnesisLifestyle({
        patientUserId,
        recordDate: b.recordDate,
        text: b.text,
        createdBy,
      }),
  );
  return NextResponse.json({ ok: true, entry }, { status: 201 });
}
