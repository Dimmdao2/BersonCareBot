import type { Pool } from "pg";
import { runMediaWorkerPgText } from "./runMediaWorkerSql.js";
import { parseSystemSettingBoolean } from "./systemSettingBoolean.js";

export type MediaWorkerRuntimeBooleanKey =
  | "video_hls_pipeline_enabled"
  | "video_watermark_enabled";

export type MediaWorkerRuntimeStringKey =
  | "error_tracking_enabled"
  | "error_tracking_dsn";

/** Generic server-audience runtime reader. Restricted system_settings is never queried here. */
export async function readServerRuntimeBoolean(
  pool: Pool,
  key: MediaWorkerRuntimeBooleanKey,
): Promise<boolean> {
  const result = await runMediaWorkerPgText<{ value_json: unknown }>(
    pool,
    `SELECT app.read_media_worker_runtime_setting($1) AS value_json`,
    [key],
  );
  return parseSystemSettingBoolean(result.rows[0]?.value_json ?? null);
}

export async function readServerRuntimeString(
  pool: Pool,
  key: MediaWorkerRuntimeStringKey,
): Promise<string | null> {
  const result = await runMediaWorkerPgText<{ value_json: unknown }>(
    pool,
    `SELECT app.read_media_worker_runtime_setting($1) AS value_json`,
    [key],
  );
  const valueJson = result.rows[0]?.value_json;
  if (valueJson === null || typeof valueJson !== "object" || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}
