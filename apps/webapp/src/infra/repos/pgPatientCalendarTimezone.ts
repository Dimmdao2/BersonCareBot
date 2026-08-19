/**
 * Patient calendar timezone through the platform_users schema and patient DB function door.
 *
 * Только чтение и первичная запись определённого устройством значения: по §34 канона владельца
 * (`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`) пояс человека не настраивается, поэтому двери
 * «записать произвольный пояс пациенту» здесь нет.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { platformUsers } from '../../../db/schema/schema';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';
import { isAcceptableIanaTimezone } from '@/modules/system-settings/calendarIana';
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
 * Если у клиента ещё нет `calendar_timezone`, записывает переданную IANA (например с `Intl` при регистрации).
 * Не перезаписывает уже заданное значение; невалидная строка игнорируется.
 */
export async function trySetInitialCalendarTimezoneIfEmpty(
  platformUserId: string,
  raw: string | null,
): Promise<void> {
  const candidate = raw?.trim() ?? '';
  if (!candidate || !isAcceptableIanaTimezone(candidate)) return;
  if (getCurrentDbPrincipal()?.kind === 'patient') {
    await runWithWebappDbOperationFamily('patient_calendar_timezone', () =>
      runWebappSql<{ updated: boolean }>(
        getWebappSqlDb(),
        sql`SELECT app.set_current_patient_calendar_timezone(${candidate}, true) AS updated`,
      ),
    );
    return;
  }
  await getWebappSqlDb()
    .update(platformUsers)
    .set({ calendarTimezone: candidate, updatedAt: sql`now()` })
    .where(
      and(
        eq(platformUsers.id, platformUserId),
        eq(platformUsers.role, 'client'),
        isNull(platformUsers.mergedIntoId),
        isNull(platformUsers.calendarTimezone),
      ),
    );
}
