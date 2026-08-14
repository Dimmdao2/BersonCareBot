/**
 * GET  /api/doctor/patients/[userId]/diagnosis-catalog?q=  → { ok, suggestions }
 * POST /api/doctor/patients/[userId]/diagnosis-catalog      → create entry
 *
 * Собственный справочник диагнозов выбранной организации: autocomplete + создание новых.
 * userId в пути используется для проверки membership в выбранном workspace.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const createBodySchema = z.object({
  label: z.string().min(1).max(500),
  note: z.string().max(2000).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const suggestions = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.patientClinical.searchDiagnosisCatalog(q),
  );

  return NextResponse.json({ ok: true, suggestions });
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

  const parsed = createBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
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
  const entry = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.patients.clinical.diagnosis-catalog.create',
    () =>
      deps.patientClinical.createDiagnosisCatalogEntry({
        label: parsed.data.label,
        note: parsed.data.note ?? null,
        createdBy: gate.ctx.session.user.userId,
      }),
  );

  return NextResponse.json({ ok: true, entry }, { status: 201 });
}
