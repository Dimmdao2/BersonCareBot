/**
 * GET  /api/doctor/patients/[userId]/comorbidities?status=active|removed|all
 *   → { ok: true, comorbidities: Comorbidity[] }
 *
 * POST /api/doctor/patients/[userId]/comorbidities
 *   Body: { text: string, since?: string | null }
 *   → { ok: true, comorbidity: Comorbidity }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const statusSchema = z.enum(['active', 'removed', 'all']).optional().default('active');

const addSchema = z.object({
  text: z.string().trim().min(1, 'comorbidity_text_required').max(500),
  since: z.string().trim().max(100).nullable().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const statusParsed = statusSchema.safeParse(searchParams.get('status') ?? 'active');
  if (!statusParsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_status' }, { status: 400 });
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

  const status = statusParsed.data;
  let comorbidities;
  comorbidities = await withDoctorWorkspacePrincipal(gate.ctx, async () => {
    if (status === 'active') return deps.patientComorbidities.listActive(patientUserId);
    if (status === 'removed') return deps.patientComorbidities.listRemoved(patientUserId);
    const [active, removed] = await Promise.all([
      deps.patientComorbidities.listActive(patientUserId),
      deps.patientComorbidities.listRemoved(patientUserId),
    ]);
    return [...active, ...removed].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });

  return NextResponse.json({ ok: true, comorbidities });
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
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

  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', issues: parsed.error.issues },
      { status: 422 },
    );
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

  try {
    const comorbidity = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor.patients.comorbidities.create',
      () =>
        deps.patientComorbidities.add({
          patientUserId,
          text: parsed.data.text,
          since: parsed.data.since ?? null,
          createdBy: gate.ctx.session.user.userId,
        }),
    );
    return NextResponse.json({ ok: true, comorbidity }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === 'comorbidity_text_required') {
      return NextResponse.json({ ok: false, error: 'comorbidity_text_required' }, { status: 422 });
    }
    throw err;
  }
}
