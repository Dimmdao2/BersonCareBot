import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { env } from '@/config/env';
import { logger } from '@/app-layer/logging/logger';
import {
  assertMediaWorkerControlReady, claimMediaWorkerControlJob, completeMediaWorkerHlsJob,
  completeMediaWorkerProgramJob, failMediaWorkerJob, loadMediaWorkerControlMedia,
  markMediaWorkerProcessing, readMediaWorkerErrorTrackingConfig, readMediaWorkerWatermarkEnabled,
  reportMediaWorkerIsolationFailure, retryMediaWorkerJob,
} from '@/app-layer/media/mediaWorkerControl';

const jobSchema = z.object({ id: z.string().uuid(), mediaId: z.string().uuid() }).strict();
const isolationEventSchema = z.enum([
  'missing_principal', 'invalid_signature_or_install', 'role_pool_mismatch', 'rls_denial',
  'cleanup_failure', 'unclassified_background_operation',
]);
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('watermark') }),
  z.object({ type: z.literal('error_tracking_config') }),
  z.object({ type: z.literal('isolation_failure'), eventClass: isolationEventSchema }),
  z.object({ type: z.literal('claim'), lockedBy: z.string().min(1).max(200), staleLockMinutes: z.number().int().positive().max(24 * 60) }),
  z.object({ type: z.literal('load'), job: jobSchema, lockedBy: z.string().min(1).max(200) }),
  z.object({ type: z.literal('processing'), job: jobSchema, lockedBy: z.string().min(1).max(200) }),
  z.object({ type: z.literal('retry'), job: jobSchema, lockedBy: z.string().min(1).max(200), nextAttemptAt: z.string().datetime(), error: z.string().max(8000) }),
  z.object({ type: z.literal('failed'), job: jobSchema, lockedBy: z.string().min(1).max(200), error: z.string().max(8000) }),
  z.object({ type: z.literal('done_hls'), job: jobSchema, lockedBy: z.string().min(1).max(200), values: z.object({ masterKey: z.string().max(2000).optional(), artifactPrefix: z.string().max(2000).optional(), posterKey: z.string().max(2000).optional(), qualitiesJson: z.string().max(8000).optional(), durationSeconds: z.number().nonnegative().nullable().optional() }) }),
  z.object({ type: z.literal('done_program'), job: jobSchema, lockedBy: z.string().min(1).max(200), values: z.object({ outputKey: z.string().min(1).max(2000), posterKey: z.string().min(1).max(2000), qualitiesJson: z.string().max(8000), durationSeconds: z.number().nonnegative().nullable() }) }),
]);

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = env.INTERNAL_JOB_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !bearerMatchesSecret(token, secret)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  enterWithDbInfraPrincipal({ source: 'api/internal/media-worker/control:POST' });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  try {
    const command = parsed.data;
    switch (command.type) {
      case 'ready': await assertMediaWorkerControlReady(); return NextResponse.json({ ok: true, result: null });
      case 'watermark': return NextResponse.json({ ok: true, result: await readMediaWorkerWatermarkEnabled() });
      case 'error_tracking_config': return NextResponse.json({ ok: true, result: await readMediaWorkerErrorTrackingConfig() });
      case 'isolation_failure': await reportMediaWorkerIsolationFailure(command.eventClass); break;
      case 'claim': return NextResponse.json({ ok: true, result: await claimMediaWorkerControlJob(command.lockedBy, command.staleLockMinutes) });
      case 'load': return NextResponse.json({ ok: true, result: await loadMediaWorkerControlMedia(command.job, command.lockedBy) });
      case 'processing': await markMediaWorkerProcessing(command.job, command.lockedBy); break;
      case 'retry': await retryMediaWorkerJob(command.job, command.lockedBy, command.nextAttemptAt, command.error); break;
      case 'failed': await failMediaWorkerJob(command.job, command.lockedBy, command.error); break;
      case 'done_hls': await completeMediaWorkerHlsJob(command.job, command.lockedBy, command.values); break;
      case 'done_program': await completeMediaWorkerProgramJob(command.job, command.lockedBy, command.values); break;
    }
    return NextResponse.json({ ok: true, result: null });
  } catch (error) {
    logger.error({ err: error, command: parsed.data.type }, '[internal/media-worker/control] failed');
    return NextResponse.json({ ok: false, error: 'control_failed' }, { status: 409 });
  }
}
