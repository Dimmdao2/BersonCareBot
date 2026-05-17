import { getPool } from "@/infra/db/client";
import { isAcceptableIanaTimezone } from "@/modules/system-settings/calendarIana";

export async function getPatientCalendarTimezoneIana(platformUserId: string): Promise<string | null> {
  const pool = getPool();
  const r = await pool.query<{ calendar_timezone: string | null }>(
    `SELECT calendar_timezone FROM platform_users WHERE id = $1::uuid AND merged_into_id IS NULL`,
    [platformUserId],
  );
  return r.rows[0]?.calendar_timezone ?? null;
}

export async function setPatientCalendarTimezoneIana(platformUserId: string, value: string | null): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query(
    `UPDATE platform_users
     SET calendar_timezone = $2, updated_at = now()
     WHERE id = $1::uuid AND role = 'client' AND merged_into_id IS NULL`,
    [platformUserId, value],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Если у клиента ещё нет `calendar_timezone`, записывает переданную IANA (например с `Intl` при регистрации).
 * Не перезаписывает уже заданное значение; невалидная строка игнорируется.
 */
export async function trySetInitialCalendarTimezoneIfEmpty(platformUserId: string, raw: string | null): Promise<void> {
  const candidate = raw?.trim() ?? "";
  if (!candidate || !isAcceptableIanaTimezone(candidate)) return;
  const pool = getPool();
  await pool.query(
    `UPDATE platform_users
     SET calendar_timezone = $2, updated_at = now()
     WHERE id = $1::uuid
       AND role = 'client'
       AND merged_into_id IS NULL
       AND calendar_timezone IS NULL`,
    [platformUserId, candidate],
  );
}
