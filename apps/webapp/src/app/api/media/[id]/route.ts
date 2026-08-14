import { NextResponse } from 'next/server';
import { env, isS3MediaEnabled } from '@/config/env';
import { logger } from '@/app-layer/logging/logger';
import { getStoredMediaBody } from '@/app-layer/media/mockMediaStorage';
import { getMediaS3KeyForRedirect } from '@/app-layer/media/s3MediaStorage';
import { serializePresignFailureForLog } from '@/app-layer/media/presignLogRedaction';
import { presignGetUrl } from '@/app-layer/media/s3Client';
import { getVideoPresignTtlSeconds } from '@/app-layer/media/videoPresignTtl';
import { getCurrentSession } from '@/modules/auth/service';
import { readSaasTestLocalMedia } from '@/app-layer/media/localSaasTestFixtureMedia';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  requireDoctorWorkspaceApiContext,
  requirePatientApiBusinessAccess,
} from '@/app-layer/guards/requireRole';
import { canAccessDoctor } from '@/modules/roles/service';
import type { AppSession } from '@/shared/types/session';
import { authorizeMediaDelivery } from '@/app-layer/media/authorizeMediaDelivery';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolvePatientOrganizationRequestContext } from '@/app-layer/patient-organization/requestContext';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function redirectPresignedOr503(s3Key: string): Promise<Response> {
  try {
    const ttlSec = await getVideoPresignTtlSeconds();
    const signed = await presignGetUrl(s3Key, ttlSec);
    /** 307 so clients (esp. Safari/WebKit video) re-issue GET+Range to the presigned URL; 302 often drops Range after redirect. */
    const res = NextResponse.redirect(signed, 307);
    res.headers.set('Cache-Control', 'private, max-age=0, must-revalidate');
    return res;
  } catch (e) {
    logger.error({ err: serializePresignFailureForLog(e) }, '[media GET] presign failed');
    return NextResponse.json({ error: 'storage_error' }, { status: 503 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 });
  }

  const initialSession = await getCurrentSession();
  if (!initialSession) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const serve = async (session: AppSession): Promise<Response> => {
    const isUuid = UUID_RE.test(id);
    const dbUrl = (env.DATABASE_URL ?? '').trim();

    /** UUID in DB → bytes live in MinIO/S3; presigned GET only (never in-process mock). */
    if (dbUrl && isUuid) {
      const access = await authorizeMediaDelivery(id, session);
      if (!access.ok && access.reason === 'not_found') {
        return NextResponse.json({ error: 'not found' }, { status: 404 });
      }
      if (!access.ok) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      const s3Key = await getMediaS3KeyForRedirect(id, {
        allowPlatformBase: access.allowPlatformBase,
      });
      if (s3Key) return redirectPresignedOr503(s3Key);
      const localBody = await readSaasTestLocalMedia({
        databaseUrl: dbUrl,
        storedPath: access.row.stored_path,
        s3Key: access.row.s3_key,
        mimeType: access.row.mime_type,
      });
      if (localBody) {
        return new Response(localBody, {
          headers: {
            'Content-Type': access.row.mime_type,
            'Content-Length': String(localBody.byteLength),
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    if (isS3MediaEnabled(env)) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const stored = getStoredMediaBody(id);
    if (!stored) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return new Response(stored.body, {
      headers: { 'Content-Type': stored.mimeType, 'Cache-Control': 'private, max-age=3600' },
    });
  };

  if (canAccessDoctor(initialSession.user.role)) {
    const gate = await requireDoctorWorkspaceApiContext();
    if (!gate.ok) return gate.response;
    return withDoctorWorkspacePrincipal(gate.ctx, () => serve(gate.ctx.session));
  }
  const patientGate = await requirePatientApiBusinessAccess();
  if (!patientGate.ok) return patientGate.response;
  const userId = patientGate.session.user.userId;
  const resolvedOrganization = await resolvePatientOrganizationRequestContext(
    buildAppDeps().patientOrganization,
    userId,
  );
  if (!resolvedOrganization.ok) {
    const status =
      resolvedOrganization.reason === 'patient_organization_unavailable'
        ? 503
        : resolvedOrganization.reason === 'organization_selection_required'
          ? 409
          : 403;
    return NextResponse.json(
      { error: resolvedOrganization.reason },
      { status },
    );
  }
  return withPatientOrganizationPrincipal(
    {
      organizationId: resolvedOrganization.organizationId,
      platformUserId: userId,
      source: 'api/media/[id]:GET',
    },
    () => serve(patientGate.session),
  );
}
