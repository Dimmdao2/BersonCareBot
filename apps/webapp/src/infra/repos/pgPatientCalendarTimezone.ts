/**
 * Patient calendar timezone through the platform_users schema and patient DB function door.
 *
 * Только чтение и запись значения, определённого устройством: по §34 канона владельца
 * (`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`) пояс человека не настраивается руками, поэтому двери
 * «записать произвольный пояс пациенту» здесь нет.
 */
import { and, eq, ne, or, isNull, sql } from 'drizzle-orm';
import { platformUsers } from '../../../db/schema/schema';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';
import { syncCalendarTimezoneFromDevice as syncIdentityCalendarTimezoneFromDevice } from '@/app-layer/platform-user/syncCalendarTimezoneFromDevice';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';

export async function getPatientCalendarTimezoneIana(
  platformUserId: string,
): Promise<string | null> {
  const rows = await getWebappSqlDb()
    .select({ calendarTimezone: platformUsers.calendarTimezone })
    .from(platformUsers)
    .where(and(eq(platformUsers.id, platformUserId), isNull(platformUsers.mergedIntoId)))
    .limit(1);
  return rows[0]?.calendarTimezone ?? null;
}

/**
 * Приводит пояс клиента к тому, что сообщило устройство (`Intl` при регистрации и при каждом заходе):
 * пишет и по пустому полю, и при расхождении. Переехал человек — пояс догоняет устройство сам, без
 * вопроса и без ручного контрола (§34). Невалидная строка игнорируется. Возвращает `true`, если
 * значение изменилось.
 */
export async function syncCalendarTimezoneFromDevice(
  platformUserId: string,
  raw: string | null,
): Promise<boolean> {
  return syncIdentityCalendarTimezoneFromDevice(platformUserId, raw, {
    readCurrent: getPatientCalendarTimezoneIana,
    writeChanged: async (targetUserId, calendarTimezone) => {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        const result = await runWithWebappDbOperationFamily('patient_calendar_timezone', () =>
          runWebappSql<{ updated: boolean }>(
            getWebappSqlDb(),
            sql`SELECT app.set_current_patient_calendar_timezone(${calendarTimezone}, false) AS updated`,
          ),
        );
        return result.rows[0]?.updated === true;
      }
      const updated = await getWebappSqlDb()
        .update(platformUsers)
        .set({ calendarTimezone, updatedAt: sql`now()` })
        .where(
          and(
            eq(platformUsers.id, targetUserId),
            eq(platformUsers.role, 'client'),
            isNull(platformUsers.mergedIntoId),
            or(
              isNull(platformUsers.calendarTimezone),
              ne(platformUsers.calendarTimezone, calendarTimezone),
            ),
          ),
        )
        .returning({ id: platformUsers.id });
      return updated.length > 0;
    },
  });
}
