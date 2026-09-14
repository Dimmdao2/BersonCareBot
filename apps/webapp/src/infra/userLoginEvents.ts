import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

const APPEND_USER_LOGIN_EVENT_ROOT =
  'app.append_user_login_event(uuid,text,text,text,text,text,text,text,text,text,text,text)';

export type UserLoginEventWrite = {
  userId: string;
  method: string;
  role: string;
  ip: string | null;
  userAgent: string | null;
  deviceKind: string | null;
  os: string | null;
  browser: string | null;
  host: string | null;
  sessionRef: string;
  /** Device marker cookie, 32 hex chars. Null when the browser refused or cleared it. */
  deviceId: string | null;
  /** Two-letter country code resolved offline from the address. Null when unknown. */
  country: string | null;
};

export type UserLoginEventAppended = {
  /** Physical row that authorized any one-time action included in the matching notice. */
  eventId: string;
  /**
   * #1112 Л-8.2а. Этого устройства у этого человека раньше не видели. Браузер без метки тоже даёт
   * `true`: узнать его нечем, и назвать неузнанное знакомым было бы неправдой.
   */
  deviceWasNew: boolean;
  /** Первый вход в жизни учётной записи. Это не «вход из нового места», а просто первый вход. */
  firstLoginEver: boolean;
};

/** Appends one successful session birth through the closed SECURITY DEFINER door. */
export async function appendUserLoginEvent(
  input: UserLoginEventWrite,
): Promise<UserLoginEventAppended> {
  const result = await runWebappNamedRoot<{
    event_id: string;
    device_was_new: boolean;
    first_login_ever: boolean;
  }>(
    getWebappSqlDb(),
    APPEND_USER_LOGIN_EVENT_ROOT,
    [
      input.userId,
      input.method,
      input.role,
      input.ip,
      input.userAgent,
      input.deviceKind,
      input.os,
      input.browser,
      input.host,
      input.sessionRef,
      input.deviceId,
      input.country,
    ],
    sql`SELECT event_id::text, device_was_new, first_login_ever FROM app.append_user_login_event(
      ${input.userId}::uuid,
      ${input.method}::text,
      ${input.role}::text,
      ${input.ip}::text,
      ${input.userAgent}::text,
      ${input.deviceKind}::text,
      ${input.os}::text,
      ${input.browser}::text,
      ${input.host}::text,
      ${input.sessionRef}::text,
      ${input.deviceId}::text,
      ${input.country}::text
    )`,
  );
  const row = result.rows[0];
  // Строка обязана быть: дверь либо вставила вход и вернула ряд, либо подняла отказ. Пустой ответ
  // здесь — не «ничего не случилось», а расхождение с дверью, и глушить его нельзя.
  if (!row) throw new Error('append_user_login_event_missing_result');
  return {
    eventId: row.event_id,
    deviceWasNew: row.device_was_new,
    firstLoginEver: row.first_login_ever,
  };
}
