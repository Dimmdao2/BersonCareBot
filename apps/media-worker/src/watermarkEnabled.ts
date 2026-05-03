import type { Pool } from "pg";

/** Admin flag: burn-in non-PII label during HLS transcode (media-worker only). */
export async function readVideoWatermarkEnabled(pool: Pool): Promise<boolean> {
  const r = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM system_settings WHERE key = 'video_watermark_enabled' AND scope = 'admin' LIMIT 1`,
  );
  const row = r.rows[0];
  if (!row) return false;
  const j = row.value_json as { value?: unknown };
  return j?.value === true;
}
