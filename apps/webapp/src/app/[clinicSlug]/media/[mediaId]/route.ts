import { NextResponse } from 'next/server';
import { env, isS3MediaEnabled } from '@/config/env';
import { logger } from '@/app-layer/logging/logger';
import { presignGetUrl } from '@/app-layer/media/s3Client';
import { serializePresignFailureForLog } from '@/app-layer/media/presignLogRedaction';
import { readSaasTestLocalMedia } from '@/app-layer/media/localSaasTestFixtureMedia';
import { resolveClinicPublicCardMediaRsc } from '../../publicClinicCard';

/** Public assets are cacheable; the card itself decides which ids exist at all. */
const PUBLIC_CACHE_CONTROL = 'public, max-age=300, must-revalidate';
const PRESIGN_TTL_SECONDS = 300;

/**
 * Public delivery of ONE image of ONE published clinic card (`/{clinic}/media/{uuid}`).
 *
 * Authorization is structural, not a check bolted on here: the declared read root returns the card
 * TOGETHER with its media set, and this route serves only ids inside that returned set. A uuid
 * belonging to any other file of the same clinic — let alone another clinic — has nothing to match
 * and is refused, with no branch to widen. The signed-in chokepoint `/api/media/{uuid}` is not
 * touched by this route in any way and keeps refusing anonymous callers exactly as before.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clinicSlug: string; mediaId: string }> },
) {
  const { clinicSlug, mediaId } = await params;
  const resolved = await resolveClinicPublicCardMediaRsc(clinicSlug, mediaId);

  if (resolved.status === 'absent') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (resolved.status === 'unavailable') {
    return NextResponse.json({ error: 'card_unavailable' }, { status: 503 });
  }

  const { media } = resolved;

  if (media.s3Key) {
    try {
      const signed = await presignGetUrl(media.s3Key, PRESIGN_TTL_SECONDS);
      const response = NextResponse.redirect(signed, 307);
      response.headers.set('Cache-Control', PUBLIC_CACHE_CONTROL);
      return response;
    } catch (error) {
      logger.error(
        { err: serializePresignFailureForLog(error) },
        '[clinic-card media GET] presign failed',
      );
      return NextResponse.json({ error: 'storage_error' }, { status: 503 });
    }
  }

  if (isS3MediaEnabled(env)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const localBody = await readSaasTestLocalMedia({
    databaseUrl: (env.DATABASE_URL ?? '').trim(),
    storedPath: media.storedPath,
    s3Key: media.s3Key,
    mimeType: media.mimeType,
  });
  if (!localBody) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return new Response(localBody, {
    headers: {
      'Content-Type': media.mimeType,
      'Content-Length': String(localBody.byteLength),
      'Cache-Control': PUBLIC_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
