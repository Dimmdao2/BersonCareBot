import type { Pool } from "pg";

export async function readPipelineEnabled(pool: Pool): Promise<boolean> {
  const r = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM system_settings WHERE key = 'video_hls_pipeline_enabled' AND scope = 'admin' LIMIT 1`,
  );
  const row = r.rows[0];
  if (!row) return false;
  const j = row.value_json as { value?: unknown };
  return j?.value === true;
}
