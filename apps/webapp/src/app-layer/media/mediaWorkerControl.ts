import { getConfigBool } from '@/modules/system-settings/configAdapter';
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
