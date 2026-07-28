/**
 * Wave 3 phase 14D — patient calendar timezone via `runWebappPgText`.
 */
import { runWebappPgText } from '@/infra/db/runWebappSql';
import { isAcceptableIanaTimezone } from '@/modules/system-settings/calendarIana';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';

export async function getPatientCalendarTimezoneIana(
  platformUserId: string,
): Promise<string | null> {
  const r = await runWebappPgText<{ calendar_timezone: string | null }>(
    `SELECT calendar_timezone FROM platform_users WHERE id = $1::uuid AND merged_into_id IS NULL`,
    [platformUserId],
  );
  return r.rows[0]?.calendar_timezone ?? null;
}

export async function setPatientCalendarTimezoneIana(
  platformUserId: string,
  value: string | null,
): Promise<boolean> {
  if (getCurrentDbPrincipal()?.kind === 'patient') {
    const result = await runWithWebappDbOperationFamily('patient_calendar_timezone', () =>
      runWebappPgText<{ updated: boolean }>(
        `SELECT app.set_current_patient_calendar_timezone($1, false) AS updated`,
        [value],
      ),
    );
    return result.rows[0]?.updated === true;
  }
  const res = await runWebappPgText(
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
export async function trySetInitialCalendarTimezoneIfEmpty(
  platformUserId: string,
  raw: string | null,
): Promise<void> {
  const candidate = raw?.trim() ?? '';
  if (!candidate || !isAcceptableIanaTimezone(candidate)) return;
  if (getCurrentDbPrincipal()?.kind === 'patient') {
    await runWithWebappDbOperationFamily('patient_calendar_timezone', () =>
      runWebappPgText<{ updated: boolean }>(
        `SELECT app.set_current_patient_calendar_timezone($1, true) AS updated`,
        [candidate],
      ),
    );
    return;
  }
  await runWebappPgText(
    `UPDATE platform_users
     SET calendar_timezone = $2, updated_at = now()
     WHERE id = $1::uuid
       AND role = 'client'
       AND merged_into_id IS NULL
       AND calendar_timezone IS NULL`,
    [platformUserId, candidate],
  );
}
