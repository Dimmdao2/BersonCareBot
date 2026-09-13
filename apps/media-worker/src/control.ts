import { z } from 'zod';
import type { SaasIsolationTelemetryEventClass } from '@bersoncare/error-tracking';
import type { StorageTarget } from './storageTarget.js';

export type ClaimedJob = { id: string; mediaId: string; organizationId: string; attempts: number };
export type ControlledMedia = {
  id: string;
  mimeType: string;
  s3Key: string | null;
  hlsMasterPlaylistS3Key: string | null;
  videoProcessingStatus: string | null;
  videoDurationSeconds: number | null;
  usagePurpose: string | null;
  /** Хранилище строки; воркер получает его в наряде и не выводит из ключа. */
  storageTarget: StorageTarget;
};

/**
 * Наряд очереди превью. Решение «что с этой строкой делать» принимает ВЕБАПП
 * (`modules/media/mediaPreviewPlan.ts`); воркер получает готовый план и разбирает байты.
 *
 * Ключи вывода приходят готовыми и никуда не возвращаются: вебапп считает их сам от `media_id`,
 * поэтому воркер не может ни перенаправить строку на чужой объект, ни назвать объект к удалению.
 */
export type MediaPreviewPlan =
  | { kind: 'image'; sourceKey: string }
  | { kind: 'heic'; sourceKey: string }
  | { kind: 'hosted_thumbnail' }
  | { kind: 'video_poster'; sourceKey: string };

export type MediaPreviewOrder = {
  mediaId: string;
  attempts: number;
  storageTarget: StorageTarget;
  plan: MediaPreviewPlan;
  standardKey: string;
  smKey: string;
  mdKey: string;
};

const previewOrderSchema = z.object({
  mediaId: z.string().min(1),
  attempts: z.number().int().nonnegative(),
  storageTarget: z.enum(['library', 'patient']),
  plan: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('image'), sourceKey: z.string().min(1) }),
    z.object({ kind: z.literal('heic'), sourceKey: z.string().min(1) }),
    z.object({ kind: z.literal('hosted_thumbnail') }),
    z.object({ kind: z.literal('video_poster'), sourceKey: z.string().min(1) }),
  ]),
  standardKey: z.string().min(1),
  smKey: z.string().min(1),
  mdKey: z.string().min(1),
});

/**
 * Неполный наряд НЕ достраивается умолчанием — по той же причине, что и наряд пересборки: воркер
 * по нему пойдёт писать и удалять объекты, и «наряд без хранилища» означал бы запись неизвестно куда.
 */
const previewClaimSchema = z.union([
  z.object({ kind: z.literal('idle') }),
  z.object({ kind: z.literal('claimed'), order: previewOrderSchema }),
]);

const previewHostedBytesSchema = z.union([
  z.object({ kind: z.literal('ready'), bytesBase64: z.string() }),
  z.object({ kind: z.literal('error'), error: z.string() }),
]);

export type MediaPreviewClaim = z.infer<typeof previewClaimSchema>;
export type MediaPreviewHostedBytes = z.infer<typeof previewHostedBytesSchema>;

export type MediaWorkerControlPort = {
  ready(): Promise<void>;
  errorTrackingConfig(): Promise<{ enabled: boolean; dsn: string | null }>;
  isolationFailure(eventClass: MediaWorkerIsolationEventClass): Promise<void>;
  claim(
    lockedBy: string,
    staleLockMinutes: number,
  ): Promise<{ kind: 'disabled' | 'idle' } | { kind: 'claimed'; job: ClaimedJob }>;
  load(job: ClaimedJob, lockedBy: string): Promise<ControlledMedia | null>;
  watermarkEnabled(): Promise<boolean>;
  processing(job: ClaimedJob, lockedBy: string): Promise<void>;
  retry(job: ClaimedJob, lockedBy: string, nextAttemptAt: string, error: string): Promise<void>;
  failed(job: ClaimedJob, lockedBy: string, error: string): Promise<void>;
  doneHls(
    job: ClaimedJob,
    lockedBy: string,
    values: {
      masterKey?: string;
      artifactPrefix?: string;
      posterKey?: string;
      qualitiesJson?: string;
      durationSeconds?: number | null;
      /** Measured source container bitrate (bits/sec) — travels alongside duration, same probe. */
      sourceBitrateBps?: number | null;
    },
  ): Promise<void>;
  doneProgram(
    job: ClaimedJob,
    lockedBy: string,
    values: {
      outputKey: string;
      posterKey: string;
      qualitiesJson: string;
      durationSeconds: number | null;
    },
  ): Promise<void>;
  previewClaim(leaseMinutes: number): Promise<MediaPreviewClaim>;
  previewHostedBytes(mediaId: string): Promise<MediaPreviewHostedBytes>;
  previewDoneImage(
    mediaId: string,
    values: { mimeType: string; sizeBytes: number; width: number; height: number },
  ): Promise<void>;
  previewDonePoster(
    mediaId: string,
    values: { width: number | null; height: number | null },
  ): Promise<void>;
  previewFailed(mediaId: string, error: string): Promise<void>;
  previewTick(values: { processed: number; errors: number; durationMs: number }): Promise<void>;
  /** Чем этот процесс умеет разбирать байты; отправляется один раз на старте. */
  previewTools(tools: readonly MediaPreviewTool[]): Promise<void>;
};

/** Словарь инструментов один с вебаппом (`modules/media/mediaPreviewPlan.ts`). */
export type MediaPreviewTool = 'heic_decoder';

/** One vocabulary with the classifier and the webapp control seam; never a second local list. */
export type MediaWorkerIsolationEventClass = SaasIsolationTelemetryEventClass;

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
      const response = await fetchImpl(
        new URL('/api/internal/media-worker/control', params.baseUrl),
        {
          method: 'POST',
          headers: { authorization: `Bearer ${params.secret}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
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
    async ready() {
      await command({ type: 'ready' });
    },
    errorTrackingConfig() {
      return command({ type: 'error_tracking_config' });
    },
    async isolationFailure(eventClass) {
      await command({ type: 'isolation_failure', eventClass });
    },
    claim(lockedBy, staleLockMinutes) {
      return command({ type: 'claim', lockedBy, staleLockMinutes });
    },
    load(job, lockedBy) {
      return command({ type: 'load', job: jobRef(job), lockedBy });
    },
    async watermarkEnabled() {
      return command({ type: 'watermark' });
    },
    async processing(job, lockedBy) {
      await command({ type: 'processing', job: jobRef(job), lockedBy });
    },
    async retry(job, lockedBy, nextAttemptAt, error) {
      await command({ type: 'retry', job: jobRef(job), lockedBy, nextAttemptAt, error });
    },
    async failed(job, lockedBy, error) {
      await command({ type: 'failed', job: jobRef(job), lockedBy, error });
    },
    async doneHls(job, lockedBy, values) {
      await command({ type: 'done_hls', job: jobRef(job), lockedBy, values });
    },
    async doneProgram(job, lockedBy, values) {
      await command({ type: 'done_program', job: jobRef(job), lockedBy, values });
    },
    async previewClaim(leaseMinutes) {
      const parsed = previewClaimSchema.safeParse(
        await command<unknown>({ type: 'preview_claim', leaseMinutes }),
      );
      if (!parsed.success) throw new MediaWorkerControlError('media_preview_claim_invalid');
      return parsed.data;
    },
    async previewHostedBytes(mediaId) {
      const parsed = previewHostedBytesSchema.safeParse(
        await command<unknown>({ type: 'preview_hosted_bytes', mediaId }),
      );
      if (!parsed.success) throw new MediaWorkerControlError('media_preview_hosted_bytes_invalid');
      return parsed.data;
    },
    async previewDoneImage(mediaId, values) {
      await command({ type: 'preview_done_image', mediaId, values });
    },
    async previewDonePoster(mediaId, values) {
      await command({ type: 'preview_done_poster', mediaId, values });
    },
    async previewFailed(mediaId, error) {
      await command({ type: 'preview_failed', mediaId, error: error.slice(0, 8000) });
    },
    async previewTick(values) {
      await command({ type: 'preview_tick', ...values });
    },
    async previewTools(tools) {
      await command({ type: 'preview_tools', tools: [...tools] });
    },
  };
}
