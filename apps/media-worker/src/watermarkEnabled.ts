import type { Pool } from 'pg';
import { readServerRuntimeBoolean } from './serverRuntimeConfig.js';

/** Admin flag: burn-in non-PII label during HLS transcode (media-worker only). */
export async function readVideoWatermarkEnabled(pool: Pool): Promise<boolean> {
  return readServerRuntimeBoolean(pool, 'video_watermark_enabled');
}
