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
  device_id: string | null;
  country: string | null;
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
            e.host,
            e.device_id,
            e.country
     FROM user_login_events e
     WHERE ${whereSql}
     ORDER BY e.occurred_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
  );

  return { items: listRes.rows, total, page, limit };
}

/** Сколько последних входов человека сворачивается в список устройств. См. `listUserLoginDevices`. */
export const USER_LOGIN_DEVICE_SCAN_LIMIT = 2000;

export type UserLoginDeviceRow = {
  group_key: string;
  /** Метка устройства, если она была; null — вход без метки (старый или браузер без кук). */
  device_id: string | null;
  last_seen_at: Date;
  /** Число входов В РАССМОТРЕННОМ ОКНЕ, а не за всё время — см. `USER_LOGIN_DEVICE_SCAN_LIMIT`. */
  login_count: string;
  device_kind: string | null;
  os: string | null;
  browser: string | null;
  method: string | null;
  countries: string[] | null;
};

/**
 * Устройства одной учётной записи — свёртка её удачных входов (#1112, вариант B).
 *
 * Группируем по метке устройства. Там, где метки нет (вход сделан до её появления или браузер кук
 * не хранит), группой становится строка браузера: это заметно грубее — одинаковые телефоны сольются
 * в одну строку, — и экран обязан сказать об этом человеку, а не выдавать догадку за опознание.
 *
 * Это НЕ список активных сессий: сессии у нас не пронумерованы, и знать, жива ли каждая из них,
 * нечем (см. `docs/_TODO/SESSIONS_AND_DEVICES_DESIGN_2026-09-13.md`). Здесь — устройства, с которых
 * входили.
 *
 * ⛔ Сворачиваются ТОЛЬКО последние `USER_LOGIN_DEVICE_SCAN_LIMIT` входов, и отбор идёт индексом
 * `(user_id, occurred_at DESC)` ДО группировки. Прежняя версия ограничивала только число строк на
 * выходе, а внутрь группировки пускала всю 395-дневную историю; независимый аудит 13.09 показал на
 * DEV цену этого на миллионе входов одного человека: 2,4 секунды и 382 МиБ временной записи на один
 * запрос одного экрана. Окно стоит здесь, а не «потом добавим»: список устройств от него не
 * страдает — устройство, с которого не входили последние две тысячи раз, человеку не интересно, — а
 * экран перестаёт зависеть от длины истории. Поэтому же `login_count` считает входы В ОКНЕ, и экран
 * обязан говорить это словами, а не выдавать за «всего».
 */
export async function listUserLoginDevices(
  userId: string,
  limit = 50,
): Promise<UserLoginDeviceRow[]> {
  const res = await runWebappSql<UserLoginDeviceRow>(
    getWebappSqlDb(),
    sql`WITH recent AS (
       SELECT e.device_id, e.user_agent, e.occurred_at, e.device_kind, e.os, e.browser,
              e.method, e.country
         FROM user_login_events e
        WHERE e.user_id = ${userId}::uuid AND e.outcome = 'success'
        ORDER BY e.occurred_at DESC
        LIMIT ${USER_LOGIN_DEVICE_SCAN_LIMIT}
     )
     SELECT COALESCE(r.device_id, 'ua:' || md5(COALESCE(r.user_agent, ''))) AS group_key,
            max(r.device_id) AS device_id,
            max(r.occurred_at) AS last_seen_at,
            count(*)::text AS login_count,
            (array_agg(r.device_kind ORDER BY r.occurred_at DESC))[1] AS device_kind,
            (array_agg(r.os ORDER BY r.occurred_at DESC))[1] AS os,
            (array_agg(r.browser ORDER BY r.occurred_at DESC))[1] AS browser,
            (array_agg(r.method ORDER BY r.occurred_at DESC))[1] AS method,
            array_remove(array_agg(DISTINCT r.country), NULL) AS countries
     FROM recent r
     GROUP BY COALESCE(r.device_id, 'ua:' || md5(COALESCE(r.user_agent, '')))
     ORDER BY max(r.occurred_at) DESC
     LIMIT ${Math.min(200, Math.max(1, limit))}`,
  );
  return res.rows;
}
