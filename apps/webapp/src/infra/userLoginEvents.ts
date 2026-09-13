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

/** Appends one successful session birth through the closed SECURITY DEFINER door. */
export async function appendUserLoginEvent(input: UserLoginEventWrite): Promise<void> {
  await runWebappNamedRoot(
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
    sql`SELECT app.append_user_login_event(
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
}
