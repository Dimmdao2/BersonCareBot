import { NextResponse } from 'next/server';
import { logger } from '@/app-layer/logging/logger';
import { handleHlsDeliveryProxyRequest } from '@/app-layer/media/hlsDeliveryProxy';
import { getMediaAccessRow } from '@/app-layer/media/s3MediaStorage';
import { getCurrentSession } from '@/modules/auth/service';
import { assertMediaPlaybackAccess } from '@/modules/media/assertMediaPlaybackAccess';
import { getPatientRuntimeBool } from '@/modules/system-settings/configAdapter';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  requireDoctorWorkspaceApiContext,
  requirePatientApiBusinessAccess,
} from '@/app-layer/guards/requireRole';
import { canAccessDoctor } from '@/modules/roles/service';
import type { AppSession } from '@/shared/types/session';
import { resolvePlatformLfkMediaAccess } from '@/app-layer/media/resolvePlatformLfkMediaAccess';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/media/[id]/hls/[[...path]] — authorized streaming proxy for HLS artifacts (same ACL family as playback JSON).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> },
) {
  const { id, path } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const initialSession = await getCurrentSession();
  if (!initialSession) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const serve = async (session: AppSession): Promise<Response> => {
    let allowPlatformBase = false;
    let accessRow = await getMediaAccessRow(id);
    if (!accessRow) {
      allowPlatformBase = await resolvePlatformLfkMediaAccess(id);
      if (allowPlatformBase) accessRow = await getMediaAccessRow(id, { allowPlatformBase: true });
    }
    if (!accessRow) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (
      !assertMediaPlaybackAccess(session, {
        usagePurpose: accessRow.usage_purpose,
        uploadedBy: accessRow.uploaded_by,
      })
    ) {
      logger.warn(
        { mediaId: id, reasonCode: 'session_unauthorized', httpStatus: 401 },
        'hls_proxy_error',
      );
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!(await getPatientRuntimeBool('video_playback_api_enabled'))) {
      return NextResponse.json({ error: 'feature_disabled' }, { status: 503 });
    }
    return handleHlsDeliveryProxyRequest({
      mediaId: id,
      pathSegments: path,
      rangeHeader: request.headers.get('Range'),
      userId: session.user.userId,
      clientAbortSignal: request.signal,
      allowPlatformBase,
    });
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
