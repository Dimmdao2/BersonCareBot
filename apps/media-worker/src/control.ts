import { z } from 'zod';

export type ClaimedJob = { id: string; mediaId: string; organizationId: string; attempts: number };
export type ControlledMedia = {
  id: string;
  mimeType: string;
  s3Key: string | null;
  hlsMasterPlaylistS3Key: string | null;
  videoProcessingStatus: string | null;
  videoDurationSeconds: number | null;
  usagePurpose: string | null;
};

export type MediaWorkerControlPort = {
  ready(): Promise<void>;
  errorTrackingConfig(): Promise<{ enabled: boolean; dsn: string | null }>;
  isolationFailure(eventClass: MediaWorkerIsolationEventClass): Promise<void>;
  claim(lockedBy: string, staleLockMinutes: number): Promise<{ kind: 'disabled' | 'idle' } | { kind: 'claimed'; job: ClaimedJob }>;
  load(job: ClaimedJob, lockedBy: string): Promise<ControlledMedia | null>;
  watermarkEnabled(): Promise<boolean>;
  processing(job: ClaimedJob, lockedBy: string): Promise<void>;
  retry(job: ClaimedJob, lockedBy: string, nextAttemptAt: string, error: string): Promise<void>;
  failed(job: ClaimedJob, lockedBy: string, error: string): Promise<void>;
  doneHls(job: ClaimedJob, lockedBy: string, values: { masterKey?: string; artifactPrefix?: string; posterKey?: string; qualitiesJson?: string; durationSeconds?: number | null }): Promise<void>;
  doneProgram(job: ClaimedJob, lockedBy: string, values: { outputKey: string; posterKey: string; qualitiesJson: string; durationSeconds: number | null }): Promise<void>;
};

export type MediaWorkerIsolationEventClass =
  | 'missing_principal' | 'invalid_signature_or_install' | 'role_pool_mismatch'
  | 'rls_denial' | 'cleanup_failure' | 'unclassified_background_operation';

const responseSchema = z.object({ ok: z.literal(true), result: z.unknown() });

export class MediaWorkerControlError extends Error {}

export function createHttpMediaWorkerControl(params: {
  baseUrl: string;
  secret: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): MediaWorkerControlPort {
  const fetchImpl = params.fetchImpl ?? fetch;
  async function command<T>(body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    try {
      const response = await fetchImpl(new URL('/api/internal/media-worker/control', params.baseUrl), {
        method: 'POST',
        headers: { authorization: `Bearer ${params.secret}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const parsed = responseSchema.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success) {
        throw new MediaWorkerControlError(`media control request failed: HTTP ${response.status}`);
      }
      return parsed.data.result as T;
    } catch (error) {
      if (error instanceof MediaWorkerControlError) throw error;
      throw new MediaWorkerControlError('media control request failed');
    } finally {
      clearTimeout(timer);
    }
  }
  const jobRef = (job: ClaimedJob) => ({ id: job.id, mediaId: job.mediaId });
  return {
    async ready() { await command({ type: 'ready' }); },
    errorTrackingConfig() { return command({ type: 'error_tracking_config' }); },
    async isolationFailure(eventClass) { await command({ type: 'isolation_failure', eventClass }); },
    claim(lockedBy, staleLockMinutes) { return command({ type: 'claim', lockedBy, staleLockMinutes }); },
    load(job, lockedBy) { return command({ type: 'load', job: jobRef(job), lockedBy }); },
    async watermarkEnabled() { return command({ type: 'watermark' }); },
    async processing(job, lockedBy) { await command({ type: 'processing', job: jobRef(job), lockedBy }); },
    async retry(job, lockedBy, nextAttemptAt, error) { await command({ type: 'retry', job: jobRef(job), lockedBy, nextAttemptAt, error }); },
    async failed(job, lockedBy, error) { await command({ type: 'failed', job: jobRef(job), lockedBy, error }); },
    async doneHls(job, lockedBy, values) { await command({ type: 'done_hls', job: jobRef(job), lockedBy, values }); },
    async doneProgram(job, lockedBy, values) { await command({ type: 'done_program', job: jobRef(job), lockedBy, values }); },
  };
}
