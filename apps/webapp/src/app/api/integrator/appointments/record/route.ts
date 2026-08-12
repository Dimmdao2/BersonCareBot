import { NextResponse } from 'next/server';
import { assertIntegratorGetRequest } from '@/app-layer/integrator/assertIntegratorGetRequest';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const integratorRecordId = url.searchParams.get('integratorRecordId')?.trim();
  if (!integratorRecordId) {
    return NextResponse.json({ ok: false, error: 'integratorRecordId required' }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.appointmentAccess) {
    return NextResponse.json(
      { ok: false, error: 'canonical appointment access not available' },
      { status: 503 },
    );
  }
  const row = await deps.appointmentAccess.getByExternalRecordIdForIntegrator(integratorRecordId);
  const record = row
    ? {
        externalRecordId: row.externalRecordId,
        phoneNormalized: row.phoneNormalized,
        recordAt: row.recordAt,
        status: row.status,
        payloadJson: row.payloadJson,
      }
    : null;
  return NextResponse.json({ ok: true, record }, { status: 200 });
}
