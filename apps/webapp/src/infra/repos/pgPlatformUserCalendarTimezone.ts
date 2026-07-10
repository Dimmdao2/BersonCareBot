import { runWebappPgText } from "@/infra/db/runWebappSql";

export async function getPlatformUserCalendarTimezone(userId: string): Promise<string | null> {
  const result = await runWebappPgText<{ calendar_timezone: string | null }>(
    `SELECT calendar_timezone FROM platform_users WHERE id = $1::uuid`,
    [userId],
  );
  return result.rows[0]?.calendar_timezone ?? null;
}

export async function setPlatformUserCalendarTimezone(userId: string, timezone: string): Promise<void> {
  await runWebappPgText(
    `UPDATE platform_users SET calendar_timezone = $2, updated_at = now() WHERE id = $1::uuid`,
    [userId, timezone],
  );
}
