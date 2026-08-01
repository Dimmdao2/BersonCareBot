import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/modules/auth/service';
import type { PlaybackDeliveryStrategy } from '@/modules/media/playbackResolveDelivery';
import { resolveMediaPlaybackPayload } from '@/app-layer/media/resolveMediaPlaybackPayload';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  requireDoctorWorkspaceApiContext,
  requirePatientApiBusinessAccess,
} from '@/app-layer/guards/requireRole';
import { canAccessDoctor } from '@/modules/roles/service';
import type { AppSession } from '@/shared/types/session';
import { authorizeMediaDelivery } from '@/app-layer/media/authorizeMediaDelivery';

function parsePreferParam(raw: string | null): PlaybackDeliveryStrategy | null {
  if (!raw) return null;
  const p = raw.trim().toLowerCase();
  if (p === 'mp4' || p === 'hls' || p === 'auto') return p;
  return null;
}

/**
 * GET /api/media/[id]/playback — JSON playback descriptor (HLS master + poster presigned, MP4 via redirect path).
 * Phase-04: gated by `video_playback_api_enabled`; session required (same family as GET /api/media/[id]).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const prefer = parsePreferParam(new URL(request.url).searchParams.get('prefer'));
    const result = await resolveMediaPlaybackPayload({
      id,
      session,
      adminPrefer: session.user.role === 'admin' ? prefer : null,
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
