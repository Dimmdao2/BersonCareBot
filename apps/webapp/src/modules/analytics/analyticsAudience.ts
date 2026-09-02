import { sql, type Column, type SQL } from 'drizzle-orm';
import { env } from '@/config/env';
import { getTestAccountIdentifiers, type TestAccountIdentifiers } from '@/config/testAccounts';

export type AnalyticsAudienceContext = {
  includeTestAccounts: boolean;
  excludedUserIds: string[];
  organizationId?: string;
};

/**
 * DEV and TEST include their own test activity; production analytics excludes configured accounts.
 */
export async function readAnalyticsIncludeTestAccounts(): Promise<boolean> {
  return env.NODE_ENV === 'development' || env.TEST;
}

/** @internal */
export function resetAnalyticsIncludeTestAccountsCacheForTests(): void {
  // Environment is immutable for the lifetime of a production process; retained for test callers.
}

/**
 * Идентификаторы служебных учёток в том виде, в каком они уезжают за именованную дверь. Один тип на
 * все платформенные поверхности: у `app_platform_settings` нет прав резолвить их в id, и каждая
 * копия этой формы рано или поздно разъезжается с той, которую разбирает SQL-корень.
 */
export type AnalyticsTestAccountSpec = {
  includeTestAccounts: boolean;
  testPhones: string[];
  testTelegramIds: string[];
  testMaxIds: string[];
};

/**
 * Идентификаторы тестовых/служебных учёток БЕЗ резолва их id. Резолв (`platform_users`,
 * `user_channel_bindings`) доступен не каждому принципалу: платформенная аналитика ходит под
 * ролью, у которой на эти таблицы прав нет, и отсекает учётки уже за дверью агрегата. Политика
 * «кого считать тестовым» при этом остаётся здесь, одна на все поверхности.
 */
export async function loadAnalyticsTestAccountSpec(): Promise<AnalyticsTestAccountSpec> {
  const includeTestAccounts = await readAnalyticsIncludeTestAccounts();
  if (includeTestAccounts) {
    return { includeTestAccounts: true, testPhones: [], testTelegramIds: [], testMaxIds: [] };
  }
  const spec = getTestAccountIdentifiers();
  return {
    includeTestAccounts: false,
    testPhones: spec?.phones ?? [],
    testTelegramIds: spec?.telegramIds ?? [],
    testMaxIds: spec?.maxIds ?? [],
  };
}

export async function loadAnalyticsAudienceContext(deps: {
  loadExcludedUserIds: (input: {
    includeTestAccounts: boolean;
    testAccountIdentifiers?: TestAccountIdentifiers | null;
  }) => Promise<string[]>;
}): Promise<AnalyticsAudienceContext> {
  const includeTestAccounts = await readAnalyticsIncludeTestAccounts();
  const testAccountIdentifiers = includeTestAccounts ? null : getTestAccountIdentifiers();
  const excludedUserIds = await deps.loadExcludedUserIds({
    includeTestAccounts,
    testAccountIdentifiers,
  });
  return { includeTestAccounts, excludedUserIds };
}

/** Fragment: `AND column <> ALL(...::uuid[])` when list non-empty. */
export function appendSqlExcludeUserIds(
  baseSql: SQL,
  userIdColumn: string,
  excludedUserIds: string[],
): SQL {
  if (excludedUserIds.length === 0) {
    return baseSql;
  }
  return sql`${baseSql} AND ${sql.raw(userIdColumn)} <> ALL(${sql.param(excludedUserIds)}::uuid[])`;
}

/** Drizzle: exclude user id column when list non-empty. */
export function drizzleExcludeUserIdColumn(
  column: Column,
  excludedUserIds: string[],
): SQL | undefined {
  if (excludedUserIds.length === 0) return undefined;
  return sql`${column} NOT IN (${drizzleSqlUuidInList(excludedUserIds)})`;
}

/**
 * Drizzle `sql` fragment: `uuid1, uuid2, …` for `NOT IN (...)`.
 * Do not use `<> ALL(${excludedUserIds}::uuid[])` in drizzle templates — pg driver gets a scalar, not uuid[].
 */
export function drizzleSqlUuidInList(excludedUserIds: string[]): SQL {
  return sql.join(
    excludedUserIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}
