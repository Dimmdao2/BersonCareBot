import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';

const paramsSchema = z.object({ userId: z.string().uuid() });
const bodySchema = z.object({}).strict();

function noStore(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
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
  const result = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.video-meeting.create-or-resume', () =>
    deps.videoMeetings!.createOrResume({
      organizationId: gate.ctx.organizationId,
      patientUserId: patient.userId,
      specialistId: gate.ctx.specialistId!,
      specialistPlatformUserId: gate.ctx.session.user.userId,
      appointmentId: null,
    }),
  );
  if (!result.ok) return noStore({ ok: false, error: result.error }, 503);
  return noStore({ ok: true, meetingId: result.meetingId, resumed: result.resumed, session: result.session, inviteFragment: result.inviteFragment });
}
