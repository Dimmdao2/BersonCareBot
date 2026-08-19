/**
 * Пояс сотрудника (специалист/админ) в `platform_users.calendar_timezone` — та же колонка, что у
 * пациента. По §34 канона владельца (`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`) человек свой пояс
 * НЕ настраивает: он определяется устройством. Поэтому здесь чтение и запись ТОЛЬКО тем значением,
 * которое прислало устройство; двери «поставить произвольный пояс» нет.
 */
import { and, eq, ne, or, isNull, sql } from 'drizzle-orm';
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
 * Приводит сохранённый пояс к тому, что сообщило устройство: пишет и по пустому полю, и при
 * расхождении. Переехал человек — при следующем заходе в приложение его пояс догоняет устройство сам,
 * без вопроса и без ручного контрола. Невалидная строка игнорируется. Возвращает `true`, если
 * значение изменилось (вызывающему это нужно, чтобы обновить экран).
 */
export async function syncPlatformUserCalendarTimezoneFromDevice(
  userId: string,
  raw: string | null,
): Promise<boolean> {
  const candidate = raw?.trim() ?? '';
  if (!candidate || !isAcceptableIanaTimezone(candidate)) return false;
  const updated = await getWebappSqlDb()
    .update(platformUsers)
    .set({ calendarTimezone: candidate, updatedAt: sql`now()` })
    .where(
      and(
        eq(platformUsers.id, userId),
        or(
          isNull(platformUsers.calendarTimezone),
          ne(platformUsers.calendarTimezone, candidate),
        ),
      ),
    )
    .returning({ id: platformUsers.id });
  return updated.length > 0;
}
