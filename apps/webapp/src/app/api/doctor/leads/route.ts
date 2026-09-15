import { NextResponse } from 'next/server';
import { withDoctorLeadsApiAccess } from '@/app-layer/leads/withDoctorLeadsApiAccess';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const archiveScope = url.searchParams.get('archived') === 'true' ? 'archived' : 'active';
  const result = await withDoctorLeadsApiAccess('read', 'doctor.leads.list', ({ ctx, leads }) =>
    leads.list({ organizationId: ctx.organizationId, archiveScope, limit: 200 }),
  );
  return result.ok ? NextResponse.json({ ok: true, leads: result.value }) : result.response;
}
