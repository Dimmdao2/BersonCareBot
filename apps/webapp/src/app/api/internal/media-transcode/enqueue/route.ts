import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { logger } from '@/app-layer/logging/logger';
import { enqueueMediaTranscodeJobForService } from '@/app-layer/media/mediaTranscodeJobs';
import { getConfigBool } from '@/modules/system-settings/configAdapter';

const bodySchema = z.object({
  mediaId: z.string().uuid(),
});

/**
 * POST — enqueue a single HLS transcode job for `media_files.id` (video/*, readable, S3 key present).
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`. Respects `video_hls_pipeline_enabled` (503 when off).
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  enterWithDbInfraPrincipal({ source: 'api/internal/media-transcode/enqueue:POST' });

  const enabled = await getConfigBool('video_hls_pipeline_enabled');
  if (!enabled) {
    return NextResponse.json({ ok: false, error: 'pipeline_disabled' }, { status: 503 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const json: unknown = await request.json();
    parsed = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  try {
    const out = await enqueueMediaTranscodeJobForService(parsed.mediaId);
    if (!out.ok) {
      const status = out.error === 'not_found' ? 404 : 400;
      return NextResponse.json({ ok: false, error: out.error }, { status });
    }
    if (out.kind === 'already_ready') {
      return NextResponse.json({ ok: true, skipped: 'already_ready' as const });
    }
    return NextResponse.json({
      ok: true,
      jobId: out.jobId,
      alreadyQueued: out.alreadyQueued,
    });
  } catch (e) {
    logger.error({ err: e }, '[internal/media-transcode/enqueue] failed');
    return NextResponse.json({ ok: false, error: 'enqueue_failed' }, { status: 500 });
  }
}
