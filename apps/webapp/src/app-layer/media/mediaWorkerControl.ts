import { readErrorTrackingRuntimeConfig } from '@/app-layer/observability/errorTracking';
import { reportSaasIsolationEventBestEffort } from '@/infra/saasIsolationReporterRuntime';
import type { SaasIsolationEventClass } from '@/modules/operator-health/saasIsolationDiagnostics';
import { RuntimeSettingUnavailableError } from '@/modules/system-settings/runtimeSettingUnavailable';
import {
  assertMediaWorkerControlReady, completeMediaWorkerHlsJob, completeMediaWorkerProgramJob, failMediaWorkerJob,
  loadMediaWorkerControlMedia, markMediaWorkerProcessing, reclaimAndClaimMediaWorkerJob, retryMediaWorkerJob,
} from '@/infra/repos/pgMediaWorkerControl';
import {
  readMediaWorkerRuntimeSettingInnerValue,
  type MediaWorkerRuntimeSettingKey,
} from '@/infra/repos/pgSystemSettings';
import {
  claimMediaPreviewOrder, completeMediaPreviewImage, completeMediaPreviewPoster, failMediaPreview,
  readHostedPreviewSourceUrl, releaseBlockedMediaPreviews,
} from '@/infra/repos/pgMediaPreviewControl';
import {
  HOSTED_PREVIEW_RETRY,
  HOSTED_PREVIEW_UNAVAILABLE,
  type PreviewTool,
} from '@/modules/media/mediaPreviewPlan';
import { resolveHostedVideoThumbnail } from '@/shared/lib/hostedVideoThumbnail';
import { recordOperatorCronJobTickBestEffort } from '@/app-layer/operator-health/recordOperatorCronJobTick';
import {
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_PREVIEW_PROCESS_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';

/**
 * Воркер на старте говорит, чем он умеет разбирать байты. Единственное следствие — выпустить из
 * `blocked` строки, которые ждали именно этого (владелец 14.09.2026: деплой с декодером обязан
 * сбрасывать отложенное). Отчёт НЕ включает инструмент в работу и ничего не настраивает: что
 * запускать, решает план наряда, а здесь только снимается ожидание.
 */
export async function reportMediaPreviewTools(tools: readonly PreviewTool[]): Promise<number> {
  return releaseBlockedMediaPreviews(tools);
}

async function readMediaWorkerRuntimeBool(key: MediaWorkerRuntimeSettingKey): Promise<boolean> {
  const value = await readMediaWorkerRuntimeSettingInnerValue(key);
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  throw new RuntimeSettingUnavailableError(key);
}

export { assertMediaWorkerControlReady, completeMediaWorkerHlsJob, completeMediaWorkerProgramJob, failMediaWorkerJob, loadMediaWorkerControlMedia, markMediaWorkerProcessing, retryMediaWorkerJob };
export async function claimMediaWorkerControlJob(lockedBy: string, staleLockMinutes: number) {
  return reclaimAndClaimMediaWorkerJob({ enabled: await readMediaWorkerRuntimeBool('video_hls_pipeline_enabled'), lockedBy, staleLockMinutes });
}
export async function readMediaWorkerWatermarkEnabled(): Promise<boolean> {
  return readMediaWorkerRuntimeBool('video_watermark_enabled');
}
export function readMediaWorkerErrorTrackingConfig() {
  return readErrorTrackingRuntimeConfig();
}
export function reportMediaWorkerIsolationFailure(eventClass: SaasIsolationEventClass): Promise<void> {
  return reportSaasIsolationEventBestEffort({
    eventClass,
    sourceService: 'media_worker',
    sourceOperation: 'media_transcode_tick',
  });
}

export { claimMediaPreviewOrder, completeMediaPreviewImage, completeMediaPreviewPoster, failMediaPreview };

/**
 * Байты чужой обложки для наряда превью.
 *
 * У воркера нет выхода в интернет к произвольным хостам и нет сервисного токена VK — ходить к
 * провайдеру продолжает вебапп. Он при этом обложку НЕ РАЗБИРАЕТ: получил байты, передал их
 * воркеру, тот их декодирует у себя. Разбор — единственное, что мы отсюда унесли.
 */
export async function readMediaPreviewHostedBytes(
  mediaId: string,
): Promise<{ kind: 'ready'; bytesBase64: string } | { kind: 'error'; error: string }> {
  const url = await readHostedPreviewSourceUrl(mediaId);
  if (!url) return { kind: 'error', error: `${HOSTED_PREVIEW_UNAVAILABLE}: source_url_missing` };
  const outcome = await resolveHostedVideoThumbnail(url);
  if (outcome.kind === 'terminal') {
    return { kind: 'error', error: `${HOSTED_PREVIEW_UNAVAILABLE}: ${outcome.reason}` };
  }
  if (outcome.kind === 'retryable') {
    return { kind: 'error', error: `${HOSTED_PREVIEW_RETRY}: ${outcome.reason}` };
  }
  return { kind: 'ready', bytesBase64: outcome.bytes.toString('base64') };
}

/**
 * Отметка живости очереди превью в «Здоровье системы».
 *
 * Раньше строку `media.preview.process` писала HTTP-дверь, которую будил host-cron раз в минуту, —
 * и писала «успех» даже тогда, когда обрабатывать было нечем. Теперь очередь ведёт резидентный
 * `media-worker`, поэтому отметку ставит он же: умер воркер — строка протухла, и это видно.
 */
export async function recordMediaPreviewTick(params: {
  processed: number;
  errors: number;
  durationMs: number;
}): Promise<void> {
  await recordOperatorCronJobTickBestEffort({
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_PREVIEW_PROCESS_JOB_KEY,
    startedAtIso: new Date(Date.now() - Math.max(0, params.durationMs)).toISOString(),
    durationMs: params.durationMs,
    success: params.errors === 0,
    metaJson: { processed: params.processed, errors: params.errors },
  });
}
