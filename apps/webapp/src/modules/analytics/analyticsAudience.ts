import { sql, type Column, type SQL } from 'drizzle-orm';
import {
  normalizeTestAccountIdentifiersValue,
  type TestAccountIdentifiers,
} from '@/modules/system-settings/testAccounts';
import type { SystemSetting } from '@/modules/system-settings/types';
const TTL_MS = 30_000;

type IncludeTestCacheEntry = { value: boolean; expiresAt: number };
let includeTestCache: IncludeTestCacheEntry | null = null;

export type AnalyticsAudienceContext = {
  includeTestAccounts: boolean;
  excludedUserIds: string[];
  organizationId?: string;
};

function readBooleanValueJson(valueJson: unknown): boolean {
  if (valueJson === null || typeof valueJson !== 'object') return false;
  const v = (valueJson as Record<string, unknown>).value;
  return v === true || v === 'true';
}

type SettingsReader = {
  getSetting(
    key: 'dev_mode' | 'test_account_identifiers',
    scope: 'admin',
  ): Promise<SystemSetting | null>;
};

/**
 * Test users are included in analytics only when dev_mode is on.
 */
export async function readAnalyticsIncludeTestAccounts(deps: {
  systemSettings: SettingsReader;
}): Promise<boolean> {
  const now = Date.now();
  if (includeTestCache && includeTestCache.expiresAt > now) {
    return includeTestCache.value;
  }
  try {
    const devRow = await deps.systemSettings.getSetting('dev_mode', 'admin');
    const value = readBooleanValueJson(devRow?.valueJson ?? null);
    includeTestCache = { value, expiresAt: now + TTL_MS };
    return value;
  } catch {
    return false;
  }
}

/** @internal */
export function resetAnalyticsIncludeTestAccountsCacheForTests(): void {
  includeTestCache = null;
}

async function readAnalyticsTestAccountIdentifiers(deps: {
  systemSettings: SettingsReader;
}): Promise<TestAccountIdentifiers | null> {
  const row = await deps.systemSettings.getSetting('test_account_identifiers', 'admin');
  if (!row?.valueJson || typeof row.valueJson !== 'object') return null;
  const inner = (row.valueJson as Record<string, unknown>).value;
  return normalizeTestAccountIdentifiersValue(inner);
}

/**
 * Идентификаторы тестовых/служебных учёток БЕЗ резолва их id. Резолв (`platform_users`,
 * `user_channel_bindings`) доступен не каждому принципалу: платформенная аналитика ходит под
 * ролью, у которой на эти таблицы прав нет, и отсекает учётки уже за дверью агрегата. Политика
 * «кого считать тестовым» при этом остаётся здесь, одна на все поверхности.
 */
export async function loadAnalyticsTestAccountSpec(deps: {
  systemSettings: SettingsReader;
}): Promise<{
  includeTestAccounts: boolean;
  testPhones: string[];
  testTelegramIds: string[];
  testMaxIds: string[];
}> {
  const includeTestAccounts = await readAnalyticsIncludeTestAccounts(deps);
  if (includeTestAccounts) {
    return { includeTestAccounts: true, testPhones: [], testTelegramIds: [], testMaxIds: [] };
  }
  const spec = await readAnalyticsTestAccountIdentifiers(deps);
  return {
    includeTestAccounts: false,
    testPhones: spec?.phones ?? [],
    testTelegramIds: spec?.telegramIds ?? [],
    testMaxIds: spec?.maxIds ?? [],
  };
}

export async function loadAnalyticsAudienceContext(deps: {
  systemSettings: SettingsReader;
  loadExcludedUserIds: (input: {
    includeTestAccounts: boolean;
    excludeStaffRoles?: boolean;
    testAccountIdentifiers?: TestAccountIdentifiers | null;
  }) => Promise<string[]>;
  excludeStaffRoles?: boolean;
}): Promise<AnalyticsAudienceContext> {
  const includeTestAccounts = await readAnalyticsIncludeTestAccounts(deps);
  const testAccountIdentifiers = includeTestAccounts
    ? null
    : await readAnalyticsTestAccountIdentifiers(deps);
  const excludedUserIds = await deps.loadExcludedUserIds({
    includeTestAccounts,
    excludeStaffRoles: deps.excludeStaffRoles,
    testAccountIdentifiers,
  });
  return { includeTestAccounts, excludedUserIds };
}

/** Raw SQL: `AND column <> ALL($n::uuid[])` when list non-empty. */
export function appendSqlExcludeUserIds(
  baseSql: string,
  userIdColumn: string,
  excludedUserIds: string[],
  params: unknown[],
): { sql: string; params: unknown[] } {
  if (excludedUserIds.length === 0) {
    return { sql: baseSql, params };
  }
  const paramIndex = params.length + 1;
  return {
    sql: `${baseSql} AND ${userIdColumn} <> ALL($${paramIndex}::uuid[])`,
    params: [...params, excludedUserIds],
  };
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
