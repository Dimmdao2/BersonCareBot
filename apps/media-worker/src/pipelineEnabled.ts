import type { Pool } from "pg";
import { runMediaWorkerPgText } from "./runMediaWorkerSql.js";
import { parseSystemSettingBoolean } from "./systemSettingBoolean.js";

export async function readPipelineEnabled(pool: Pool): Promise<boolean> {
  const r = await runMediaWorkerPgText<{ value_json: unknown }>(
    pool,
    `SELECT value_json FROM public.system_settings WHERE key = 'video_hls_pipeline_enabled' AND scope = 'admin' LIMIT 1`,
  );
  const row = r.rows[0];
  if (!row) return false;
  return parseSystemSettingBoolean(row.value_json);
}
