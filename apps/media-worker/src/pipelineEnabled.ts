import type { Pool } from 'pg';
import { readServerRuntimeBoolean } from './serverRuntimeConfig.js';

export async function readPipelineEnabled(pool: Pool): Promise<boolean> {
  return readServerRuntimeBoolean(pool, 'video_hls_pipeline_enabled');
}
