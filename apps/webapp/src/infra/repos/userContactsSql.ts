import type { PoolClient } from 'pg';
import { getTableName, sql } from 'drizzle-orm';
import { mutateCanonicalUserContacts, type CanonicalContactMutation, type MergeSqlExecutor } from '@bersoncare/platform-merge';
import {
  getWebappSqlFromPgClient,
  runWebappSql,
  type WebappSqlExecutor,
} from '@/infra/db/runWebappSql';
import { platformUsers, userContacts } from '../../../db/schema/schema';

/** Lateral join for primary phone on `platform_users` aliased as `pu`. */
export const USER_CONTACTS_PRIMARY_PHONE_LATERAL = `LEFT JOIN LATERAL (
  SELECT uc.value_normalized, uc.confirmed_at
  FROM user_contacts uc
  WHERE uc.platform_user_id = pu.id
    AND uc.contact_kind = 'phone'
    AND uc.is_primary = true
  LIMIT 1
) uc_pri_phone ON true`;

/** Lateral join for primary email on `platform_users` aliased as `pu`. */
export const USER_CONTACTS_PRIMARY_EMAIL_LATERAL = `LEFT JOIN LATERAL (
  SELECT uc.value_normalized, uc.confirmed_at
  FROM user_contacts uc
  WHERE uc.platform_user_id = pu.id
    AND uc.contact_kind = 'email'
    AND uc.is_primary = true
  LIMIT 1
) uc_pri_email ON true`;

/** Both primary phone and email laterals; requires `platform_users` aliased as `pu`. */
export const USER_CONTACTS_PRIMARY_LATERALS = `${USER_CONTACTS_PRIMARY_PHONE_LATERAL}
     ${USER_CONTACTS_PRIMARY_EMAIL_LATERAL}`;

/**
 * Primary contact columns. `user_contacts` is the source of truth (D15b/6): it holds the uniqueness
 * ("one phone = one account", migration 0380) and, unlike the scalar columns it replaced, it can
 * hold the several confirmed phones and e-mails one person is allowed to have
 * (`IDENTITY_AND_MERGE_SCHEME.md` §2). No fallback to the legacy columns: canonical coverage is
 * total and merge tombstones carry no contacts on either side. Requires
 * {@link USER_CONTACTS_PRIMARY_LATERAL}s.
 */
export const CONTACTS = {
  phoneNormalized: 'uc_pri_phone.value_normalized',
  phoneConfirmedAt: 'uc_pri_phone.confirmed_at',
  email: 'uc_pri_email.value_normalized',
  emailNormalized: 'uc_pri_email.value_normalized',
  emailVerifiedAt: 'uc_pri_email.confirmed_at',
} as const;

/** Non-empty primary phone (requires phone lateral). */
export const CONTACTS_HAS_PHONE = `(${CONTACTS.phoneNormalized} IS NOT NULL AND btrim(${CONTACTS.phoneNormalized}) <> '')`;

/** Missing/blank primary phone (requires phone lateral). */
export const CONTACTS_NO_PHONE = `(${CONTACTS.phoneNormalized} IS NULL OR btrim(${CONTACTS.phoneNormalized}) = '')`;

/** Primary phone for an arbitrary `platform_users` alias (no lateral join required). */
export function primaryPhoneSubqueryFor(puAlias: string): string {
  return `(SELECT uc.value_normalized FROM user_contacts uc WHERE uc.platform_user_id = ${puAlias}.id AND uc.contact_kind = 'phone' AND uc.is_primary = true LIMIT 1)`;
}

function resolveWebappSqlExecutor(executor: WebappSqlExecutor | PoolClient): WebappSqlExecutor {
  if ('release' in executor && typeof (executor as PoolClient).release === 'function') {
    return getWebappSqlFromPgClient(executor as PoolClient);
  }
  return executor as WebappSqlExecutor;
}

function webappMergeSqlExecutor(db: WebappSqlExecutor): MergeSqlExecutor {
  return {
    executeSql: (fragment) => runWebappSql(db, fragment),
  };
}

/** Webapp adapter for the single canonical contact mutation root. */
export async function mutateCanonicalUserContactsWebapp(
  executor: WebappSqlExecutor | PoolClient,
  platformUserId: string,
  mutations: readonly CanonicalContactMutation[],
): Promise<void> {
  const db = resolveWebappSqlExecutor(executor);
  await mutateCanonicalUserContacts(webappMergeSqlExecutor(db), platformUserId, mutations);
}

/**
 * Первичный контакт человека — ОДИН подзапрос с параметрами (вид контакта и колонка), а не четыре
 * похожих текста: варианты одного действия — параметры одной точки (AGENTS.md §5).
 *
 * Обе стороны корреляции пишутся ЯВНО и с квалификацией, и это не стиль, а условие корректности.
 * Внутренняя таблица получает псевдоним, внешняя ссылка несёт имя таблицы. Прежняя редакция
 * подставляла drizzle-колонки (`${userContacts.platformUserId} = ${platformUsers.id}`), а drizzle
 * печатает колонку БЕЗ имени таблицы, когда фрагмент стоит в списке выборки `.select({…})` (в
 * `WHERE` — с именем). В списке выборки получалось `WHERE "platform_user_id" = "id"`, и `"id"`
 * связывался с `user_contacts.id` — СОБСТВЕННЫМ ключом подзапроса, а не с человеком снаружи.
 * Условие ложно всегда, ошибки нет: подзапрос молча возвращает NULL. Замерено 22.08.2026 на
 * `bcb_webapp_dev`: у владельца строка почты есть и подтверждена, а `getProfileEmailFields`
 * отдавал `{email:null, emailVerifiedAt:null}` — «почта не подтверждена» в интерфейсе после
 * цутовера `20260821T040000` вместо отказа прав, который было бы видно.
 *
 * Внешняя ссылка — `"platform_users"."id"`, поэтому вызывающий обязан держать `platform_users` БЕЗ
 * псевдонима (drizzle-построители так и делают). Псевдоним теперь ломает запрос ГРОМКО (42P01
 * «invalid reference to FROM-clause entry»), а не тихо, — это и требуется: тихий NULL и был дефектом.
 * Для сырого SQL с псевдонимом `pu` в файле есть отдельная форма — {@link USER_CONTACTS_PRIMARY_LATERALS}.
 */
const PLATFORM_USERS_ID = sql.raw(`"${getTableName(platformUsers)}"."${platformUsers.id.name}"`);

function drizzlePrimaryContactCol(
  contactKind: 'phone' | 'email',
  column: typeof userContacts.valueNormalized | typeof userContacts.confirmedAt,
) {
  const contact = sql.raw('primary_contact');
  return sql<string | null>`(
  SELECT ${contact}.${sql.raw(column.name)} FROM ${userContacts} AS ${contact}
   WHERE ${contact}.${sql.raw(userContacts.platformUserId.name)} = ${PLATFORM_USERS_ID}
     AND ${contact}.${sql.raw(userContacts.contactKind.name)} = ${contactKind}
     AND ${contact}.${sql.raw(userContacts.isPrimary.name)} = true
   LIMIT 1
)`;
}

/** Drizzle primary phone for the user (reads `user_contacts` only). */
export const drizzlePrimaryPhoneCol = drizzlePrimaryContactCol(
  'phone',
  userContacts.valueNormalized,
);

export const drizzlePrimaryPhoneConfirmedAtCol = drizzlePrimaryContactCol(
  'phone',
  userContacts.confirmedAt,
);

export const drizzlePrimaryEmailCol = drizzlePrimaryContactCol(
  'email',
  userContacts.valueNormalized,
);

export const drizzlePrimaryEmailConfirmedAtCol = drizzlePrimaryContactCol(
  'email',
  userContacts.confirmedAt,
);
