import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/modules/auth/service';
import { resolveMediaPlaybackPayload } from '@/app-layer/media/resolveMediaPlaybackPayload';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  requireDoctorWorkspaceApiContext,
  requirePatientApiBusinessAccess,
} from '@/app-layer/guards/requireRole';
import { canAccessDoctor } from '@/modules/roles/service';
import type { AppSession } from '@/shared/types/session';
import { authorizeMediaDelivery } from '@/app-layer/media/authorizeMediaDelivery';

/**
 * GET /api/media/[id]/playback — JSON playback descriptor (HLS master + poster presigned,
 * progressive source via redirect path when the row has no ready HLS).
 * Gated by `video_playback_api_enabled`; session required (same family as GET /api/media/[id]).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 });
  }

  const initialSession = await getCurrentSession();
  if (!initialSession) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const serve = async (session: AppSession): Promise<Response> => {
    const access = await authorizeMediaDelivery(id, session);
    if (!access.ok && access.reason === 'not_found') {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (!access.ok) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const result = await resolveMediaPlaybackPayload({
      id,
      session,
      allowPlatformBase: access.allowPlatformBase,
    });
    return result.ok
      ? NextResponse.json(result.data)
      : NextResponse.json({ error: result.error }, { status: result.status });
  };
  if (canAccessDoctor(initialSession.user.role)) {
    const gate = await requireDoctorWorkspaceApiContext();
    if (!gate.ok) return gate.response;
    return withDoctorWorkspacePrincipal(gate.ctx, () => serve(gate.ctx.session));
  }
  const patientGate = await requirePatientApiBusinessAccess();
  if (!patientGate.ok) return patientGate.response;
  return serve(patientGate.session);
}
