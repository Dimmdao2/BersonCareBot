import { eq } from 'drizzle-orm';
import { platformUsers } from '../../../db/schema/schema';
import { getWebappSqlDb, runWebappPgText } from '@/infra/db/runWebappSql';

export async function getPlatformUserCalendarTimezone(userId: string): Promise<string | null> {
  const rows = await getWebappSqlDb()
    .select({ calendarTimezone: platformUsers.calendarTimezone })
    .from(platformUsers)
    .where(eq(platformUsers.id, userId))
    .limit(1);
  return rows[0]?.calendarTimezone ?? null;
}

export async function setPlatformUserCalendarTimezone(
  userId: string,
  timezone: string,
): Promise<void> {
  await runWebappPgText(
    `UPDATE platform_users SET calendar_timezone = $2, updated_at = now() WHERE id = $1::uuid`,
    [userId, timezone],
  );
}
