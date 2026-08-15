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
