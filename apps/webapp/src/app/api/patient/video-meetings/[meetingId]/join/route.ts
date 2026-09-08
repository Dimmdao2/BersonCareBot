import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requirePatientWorkspaceModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';

const paramsSchema = z.object({ meetingId: z.string().uuid() });

export async function POST(_request: Request, context: { params: Promise<{ meetingId: string }> }) {
  const gate = await requirePatientApiBusinessAccess();
  if (!gate.ok) return gate.response;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ ok: false, error: 'meeting_unavailable' }, { status: 404 });
  const deps = buildAppDeps();
  const workspaceModule = await requirePatientWorkspaceModuleForApi(
    deps,
    gate.session.user.userId,
    'video_meetings',
  );
  if (!workspaceModule.ok) return NextResponse.json({ ok: false, error: 'meeting_unavailable' }, { status: 404 });
  const entitlement = await requireEntitlementForRead(
    { organizationId: workspaceModule.organizationId },
    'video_meetings',
  );
  if (!entitlement.ok || !deps.videoMeetings) return NextResponse.json({ ok: false, error: 'meeting_unavailable' }, { status: 404 });
  const result = await withPatientOrganizationPrincipal(
    { organizationId: workspaceModule.organizationId, platformUserId: gate.session.user.userId, source: 'patient.video-meeting.join' },
    () => deps.videoMeetings!.joinAuthenticatedPatient({ meetingId: params.data.meetingId, organizationId: workspaceModule.organizationId, patientUserId: gate.session.user.userId }),
  );
  if (!result.ok) return NextResponse.json({ ok: false, error: 'meeting_unavailable' }, { status: 404 });
  const response = NextResponse.json({ ok: true, session: result.session });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
