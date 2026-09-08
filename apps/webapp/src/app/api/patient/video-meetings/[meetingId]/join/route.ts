import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';

const paramsSchema = z.object({ meetingId: z.string().uuid() });

export async function POST(_request: Request, context: { params: Promise<{ meetingId: string }> }) {
  const gate = await requirePatientApiBusinessAccess();
  if (!gate.ok) return gate.response;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ ok: false, error: 'meeting_unavailable' }, { status: 404 });
  const deps = buildAppDeps();
  const tenant = await resolvePatientEnrollmentOrganizationId({ patientOrganization: deps.patientOrganization }, gate.session.user.userId);
  if (!tenant.ok) return NextResponse.json({ ok: false, error: 'meeting_unavailable' }, { status: 404 });
  const entitlement = await requireEntitlementForRead({ organizationId: tenant.organizationId }, 'video_meetings');
  if (!entitlement.ok || !deps.videoMeetings) return NextResponse.json({ ok: false, error: 'meeting_unavailable' }, { status: 404 });
  const result = await withPatientOrganizationPrincipal(
    { organizationId: tenant.organizationId, platformUserId: gate.session.user.userId, source: 'patient.video-meeting.join' },
    () => deps.videoMeetings!.joinAuthenticatedPatient({ meetingId: params.data.meetingId, organizationId: tenant.organizationId, patientUserId: gate.session.user.userId }),
  );
  if (!result.ok) return NextResponse.json({ ok: false, error: 'meeting_unavailable' }, { status: 404 });
  const response = NextResponse.json({ ok: true, join: result.join });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
