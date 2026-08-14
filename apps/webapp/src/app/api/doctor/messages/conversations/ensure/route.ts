/**
 * POST /api/doctor/messages/conversations/ensure — открыть webapp support-chat по пациенту.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { serializeSupportMessage } from '@/modules/messaging/serializeSupportMessage';

const bodySchema = z.object({
  patientUserId: z.string().uuid(),
});

export async function POST(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    parsed.data.patientUserId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'patient_not_found' }, { status: 404 });
  }

  let data: Awaited<ReturnType<typeof deps.messaging.doctorSupport.ensureConversationForPatient>>;
  try {
    data = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.messaging.doctorSupport.ensureConversationForPatient(parsed.data.patientUserId),
    );
  } catch {
    return NextResponse.json({ ok: false, error: 'conversation_ensure_failed' }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    conversationId: data.conversationId,
    messages: data.messages.map(serializeSupportMessage),
    unreadFromUserCount: data.unreadFromUserCount,
  });
}
