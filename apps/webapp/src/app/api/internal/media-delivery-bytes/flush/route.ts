import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { logger } from '@/app-layer/logging/logger';
import { flushHlsDeliveryByteMeterBestEffort } from '@/app-layer/media/hlsDeliveryByteMeterFlush';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_MEDIA_DELIVERY_BYTES_FLUSH_JOB_KEY,
  OPERATOR_MEDIA_JOB_FAMILY,
} from '@/modules/operator-health/reconcileJobKeys';

/**
 * HOUSEKEEPING: drains the HLS proxy's in-memory byte counter (`hlsDeliveryByteMeter.ts`) into
 * `media_playback_delivery_daily`. Bearer `INTERNAL_JOB_SECRET`, no parameters.
 *
 * The only writer of that table — VIDEO_DELIVERY_COST_AND_METERING (11.09.2026) requires the proxy
 * itself to never `INSERT`/`UPDATE` per segment, so this tick is the sole flush path.
 */
export async function POST(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;
  enterWithDbInfraPrincipal({ source: 'api/internal/media-delivery-bytes/flush:POST' });

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const result = await flushHlsDeliveryByteMeterBestEffort({ throwErrors: true });

    logger.info(
      {
        rowsFlushed: result.rowsFlushed,
        requestsFlushed: result.requestsFlushed,
        bytesFlushed: result.bytesFlushed,
      },
      'media_delivery_bytes_flush_job',
    );

    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      jobKey: OPERATOR_MEDIA_DELIVERY_BYTES_FLUSH_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: true,
      metaJson: {
        rowsFlushed: result.rowsFlushed,
        requestsFlushed: result.requestsFlushed,
        bytesFlushed: result.bytesFlushed,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      jobKey: OPERATOR_MEDIA_DELIVERY_BYTES_FLUSH_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, '[internal/media-delivery-bytes/flush] failed');
    return NextResponse.json({ ok: false, error: 'flush_failed' }, { status: 500 });
  }
}
