import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';

const paramsSchema = z.object({ userId: z.string().uuid(), meetingId: z.string().uuid() });
const bodySchema = z.union([
  z.object({ action: z.enum(['rotate_invite', 'revoke_invite', 'end']) }).strict(),
  z.object({
    diagnostic: z.object({
      event: z.enum(['join', 'error', 'end']),
      durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
      transport: z.enum(['p2p', 'relay']).optional(),
      errorClass: z.enum(['connection', 'media', 'provider']).optional(),
    }).strict(),
  }).strict(),
]);

function noStore(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string; meetingId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  if (!gate.ctx.specialistId) return noStore({ ok: false, error: 'forbidden' }, 403);
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return noStore({ ok: false, error: 'invalid_request' }, 400);
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'video_meetings');
  if (!entitlement.ok) return entitlement.response;
  const deps = buildAppDeps();
  const workspaceModule = await requireDoctorWorkspaceModuleForApi(deps, gate.ctx, 'video_meetings');
  if (!workspaceModule.ok) return workspaceModule.response;
  if (!deps.videoMeetings) return noStore({ ok: false, error: 'provider_unavailable' }, 503);
  const patient = await deps.doctorClientsPort.getClientIdentityForOrganization(
    params.data.userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!patient) return noStore({ ok: false, error: 'not_found' }, 404);
  const lifecycleInput = {
    meetingId: params.data.meetingId,
    organizationId: gate.ctx.organizationId,
    patientUserId: patient.userId,
    specialistId: gate.ctx.specialistId,
    actorPlatformUserId: gate.ctx.session.user.userId,
  };
  if (!('action' in body.data)) {
    const ok = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.video-meeting.lifecycle', () =>
      deps.videoMeetings!.recordDiagnostic({ ...lifecycleInput, ...body.data.diagnostic }),
    );
    return ok ? noStore({ ok: true }) : noStore({ ok: false, error: 'meeting_unavailable' }, 404);
  }
  const action = body.data.action;
  if (action === 'rotate_invite') {
    const result = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor.video-meeting.lifecycle',
      () => deps.videoMeetings!.rotateInvite(lifecycleInput),
    );
    if (!result.ok) return noStore({ ok: false, error: 'meeting_unavailable' }, 404);
    return noStore({
      ok: true,
      guestUrl: result.guestUrl,
      notification: {
        status: result.notification.status,
        selectedChannels: result.notification.selectedChannels,
        queuedChannels: result.notification.queuedChannels,
        deduplicatedChannels: result.notification.deduplicatedChannels,
      },
    });
  }
  const ok = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.video-meeting.lifecycle',
    () => action === 'revoke_invite'
      ? deps.videoMeetings!.revokeInvite(lifecycleInput)
      : deps.videoMeetings!.endMeeting(lifecycleInput),
  );
  if (!ok) return noStore({ ok: false, error: 'meeting_unavailable' }, 404);
  return noStore({ ok: true });
}
