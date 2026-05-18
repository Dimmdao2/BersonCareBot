import { getPool } from "@/infra/db/client";

function parseBoolFromValueJson(valueJson: unknown): boolean | null {
  if (valueJson === null || typeof valueJson !== "object" || !("value" in valueJson)) return null;
  const v = (valueJson as Record<string, unknown>).value;
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}

/**
 * SMS fallback для OTP / записи: ключ хранится в `system_settings` (doctor-патч из кабинета врача;
 * при отсутствии строки doctor — fallback на admin-сид из миграций).
 */
export async function getSmsFallbackEnabled(): Promise<boolean> {
  try {
    const pool = getPool();
    const r = await pool.query<{ value_json: unknown }>(
      `SELECT value_json FROM system_settings
       WHERE key = 'sms_fallback_enabled' AND scope IN ('doctor', 'admin')
       ORDER BY CASE scope WHEN 'doctor' THEN 0 ELSE 1 END
       LIMIT 1`,
    );
    const row = r.rows[0];
    if (!row) return true;
    const b = parseBoolFromValueJson(row.value_json);
    return b ?? true;
  } catch {
    return true;
  }
}
