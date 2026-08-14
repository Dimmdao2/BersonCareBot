/**
 * POST /api/doctor/messages/conversations/unread-by-patient — unread count по patientUserId без создания диалога.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

const bodySchema = z.object({
  patientUserId: z.string().uuid(),
});

export async function POST(request: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    parsed.data.patientUserId,
    auth.ctx.organizationId,
      auth.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'patient_not_found' }, { status: 404 });
  }
  const unreadCount = await deps.messaging.doctorSupport.unreadFromPatient(
    parsed.data.patientUserId,
    auth.ctx.organizationId,
  );
  return NextResponse.json({ ok: true, unreadCount });
}
