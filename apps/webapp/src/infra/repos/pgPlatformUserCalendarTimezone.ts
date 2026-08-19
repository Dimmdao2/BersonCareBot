/**
 * Пояс сотрудника (специалист/админ) в `platform_users.calendar_timezone` — та же колонка, что у
 * пациента. По §34 канона владельца (`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`) человек свой пояс
 * НЕ настраивает: он определяется устройством при входе. Поэтому здесь чтение и запись «только если
 * пусто»; двери «поставить произвольный пояс» нет.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { platformUsers } from '../../../db/schema/schema';
import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import { isAcceptableIanaTimezone } from '@/modules/system-settings/calendarIana';

export async function getPlatformUserCalendarTimezone(userId: string): Promise<string | null> {
  const rows = await getWebappSqlDb()
    .select({ calendarTimezone: platformUsers.calendarTimezone })
    .from(platformUsers)
    .where(eq(platformUsers.id, userId))
    .limit(1);
  return rows[0]?.calendarTimezone ?? null;
}

/**
 * Записывает определённый браузером пояс, только если в БД его ещё нет. Уже сохранённое значение не
 * перезаписывается: иначе перелёт сотрудника молча сдвигал бы его «стенные» настройки (§34 п.3).
 * Невалидная строка игнорируется.
 */
export async function trySetInitialPlatformUserCalendarTimezoneIfEmpty(
  userId: string,
  raw: string | null,
): Promise<void> {
  const candidate = raw?.trim() ?? '';
  if (!candidate || !isAcceptableIanaTimezone(candidate)) return;
  await getWebappSqlDb()
    .update(platformUsers)
    .set({ calendarTimezone: candidate, updatedAt: sql`now()` })
    .where(and(eq(platformUsers.id, userId), isNull(platformUsers.calendarTimezone)));
}
