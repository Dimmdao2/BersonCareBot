/**
 * Чтение истории входов (#1112) — по одной учётной записи или по одному адресу.
 *
 * Двух способов спросить достаточно, и третьего намеренно нет: «покажи все входы всех людей» —
 * это ровно та поверхность, от которой канон Р-АДМИН отказывается. Расследование идёт цепочкой:
 * учётная запись → её входы → подозрительный адрес → кто ещё входил с этого адреса.
 *
 * Имя человека здесь не соединяется: у роли платформы намеренно НЕТ права читать `platform_users`
 * (стена C5A, тот же факт записан в `listAdminAuditLog`). Поэтому наружу уходят идентификаторы
 * учётных записей, а имя показывает тот экран, который эту учётную запись и открыл.
 */
import { sql, type SQL } from 'drizzle-orm';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';

export type UserLoginEventRow = {
  id: string;
  user_id: string;
  occurred_at: Date;
  outcome: string;
  failure_reason: string | null;
  method: string;
  role: string;
  ip: string | null;
  user_agent: string | null;
  device_kind: string | null;
  os: string | null;
  browser: string | null;
  host: string | null;
};

export type ListUserLoginEventsParams = {
  /** Ровно одно из двух: чьи входы или с какого адреса. */
  userId?: string;
  ip?: string;
  page: number;
  limit: number;
};

export type ListUserLoginEventsResult = {
  items: UserLoginEventRow[];
  total: number;
  page: number;
  limit: number;
};

export async function listUserLoginEvents(
  params: ListUserLoginEventsParams,
): Promise<ListUserLoginEventsResult> {
  const page = Math.max(1, params.page);
  const limit = Math.min(200, Math.max(1, params.limit));
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (params.userId) conditions.push(sql`e.user_id = ${params.userId}::uuid`);
  // Адрес сравнивается как `inet`, а не как строка: иначе `95.1.2.3` и ` 95.1.2.3 ` считались бы
  // разными, а расследование строится именно на совпадении адреса.
  if (params.ip) conditions.push(sql`e.ip = ${params.ip}::inet`);
  if (conditions.length === 0) {
    // Без вопроса нет и ответа: пустой фильтр вернул бы ленту всех входов всех людей.
    return { items: [], total: 0, page, limit };
  }

  const whereSql = sql.join(conditions, sql` AND `);
  const db = getWebappSqlDb();

  const countRes = await runWebappSql<{ n: string }>(
    db,
    sql`SELECT count(*)::text AS n FROM user_login_events e WHERE ${whereSql}`,
  );
  const total = Number(countRes.rows[0]?.n ?? 0);

  const listRes = await runWebappSql<UserLoginEventRow>(
    db,
    sql`SELECT e.id,
            e.user_id,
            e.occurred_at,
            e.outcome,
            e.failure_reason,
            e.method,
            e.role,
            host(e.ip) AS ip,
            e.user_agent,
            e.device_kind,
            e.os,
            e.browser,
            e.host
     FROM user_login_events e
     WHERE ${whereSql}
     ORDER BY e.occurred_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
  );

  return { items: listRes.rows, total, page, limit };
}
