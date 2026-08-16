import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

export type EnqueueTranscodeResult =
  | { ok: true; kind: 'queued'; jobId: string; alreadyQueued: boolean }
  | { ok: true; kind: 'already_ready' }
  | { ok: false; error: 'not_found' | 'not_video' | 'not_readable' | 'no_s3_key' };

function parseEnqueueResult(value: unknown): EnqueueTranscodeResult {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid_media_transcode_enqueue_result');
  }
  const result = value as Record<string, unknown>;
  if (result.ok === false) {
    const error = result.error;
    if (
      error === 'not_found' ||
      error === 'not_video' ||
      error === 'not_readable' ||
      error === 'no_s3_key'
    ) {
      return { ok: false, error };
    }
  }
  if (result.ok === true && result.kind === 'already_ready') {
    return { ok: true, kind: 'already_ready' };
  }
  if (
    result.ok === true &&
    result.kind === 'queued' &&
    typeof result.jobId === 'string' &&
    typeof result.alreadyQueued === 'boolean'
  ) {
    return {
      ok: true,
      kind: 'queued',
      jobId: result.jobId,
      alreadyQueued: result.alreadyQueued,
    };
  }
  throw new Error('invalid_media_transcode_enqueue_result');
}

async function enqueueThroughNamedRoot(
  mediaId: string,
  identity:
    | 'app.enqueue_media_transcode_job_for_staff(uuid)'
    | 'app.enqueue_media_transcode_job_for_service(uuid)',
): Promise<EnqueueTranscodeResult> {
  const functionName = identity.endsWith('_for_staff(uuid)')
    ? 'app.enqueue_media_transcode_job_for_staff'
    : 'app.enqueue_media_transcode_job_for_service';
  const result = await runWebappNamedRoot<{ result: unknown }>(
    getWebappSqlDb(),
    identity,
    [mediaId],
    sql`SELECT ${sql.raw(functionName)}(${mediaId}::uuid) AS result`,
  );
  return parseEnqueueResult(result.rows[0]?.result);
}

/** Staff upload producer. The runtime role gets EXECUTE only, never queue DML. */
export function enqueueMediaTranscodeJob(mediaId: string): Promise<EnqueueTranscodeResult> {
  return enqueueThroughNamedRoot(mediaId, 'app.enqueue_media_transcode_job_for_staff(uuid)');
}

/** Internal media-control producer under the operational media service context. */
export function enqueueMediaTranscodeJobForService(
  mediaId: string,
): Promise<EnqueueTranscodeResult> {
  return enqueueThroughNamedRoot(mediaId, 'app.enqueue_media_transcode_job_for_service(uuid)');
}
