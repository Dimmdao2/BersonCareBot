import { getConfigBool } from '@/modules/system-settings/configAdapter';
import { readErrorTrackingRuntimeConfig } from '@/app-layer/observability/errorTracking';
import { reportSaasIsolationEventBestEffort } from '@/infra/saasIsolationReporterRuntime';
import type { SaasIsolationEventClass } from '@/modules/operator-health/saasIsolationDiagnostics';
import {
  assertMediaWorkerControlReady, completeMediaWorkerHlsJob, completeMediaWorkerProgramJob, failMediaWorkerJob,
  loadMediaWorkerControlMedia, markMediaWorkerProcessing, reclaimAndClaimMediaWorkerJob, retryMediaWorkerJob,
} from '@/infra/repos/pgMediaWorkerControl';

export { assertMediaWorkerControlReady, completeMediaWorkerHlsJob, completeMediaWorkerProgramJob, failMediaWorkerJob, loadMediaWorkerControlMedia, markMediaWorkerProcessing, retryMediaWorkerJob };
export async function claimMediaWorkerControlJob(lockedBy: string, staleLockMinutes: number) {
  return reclaimAndClaimMediaWorkerJob({ enabled: await getConfigBool('video_hls_pipeline_enabled'), lockedBy, staleLockMinutes });
}
export async function readMediaWorkerWatermarkEnabled(): Promise<boolean> {
  return getConfigBool('video_watermark_enabled');
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
