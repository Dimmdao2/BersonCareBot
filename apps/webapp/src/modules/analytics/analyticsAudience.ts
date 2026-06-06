import { and, eq, inArray, notInArray, sql, type Column, type SQL } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { normalizeTestAccountIdentifiersValue } from "@/modules/system-settings/testAccounts";
import type { SystemSetting } from "@/modules/system-settings/types";
import { platformUsers, systemSettings, userChannelBindings } from "../../../db/schema/schema";

const STAFF_ANALYTICS_ROLES = ["admin", "doctor"] as const;
const ALWAYS_EXCLUDED_ANALYTICS_PHONES = ["+70000000000"] as const;
const TTL_MS = 30_000;

type IncludeTestCacheEntry = { value: boolean; expiresAt: number };
let includeTestCache: IncludeTestCacheEntry | null = null;

export type AnalyticsAudienceContext = {
  includeTestAccounts: boolean;
  excludedUserIds: string[];
};

export type ResolveExcludedUserIdsOptions = {
  includeTestAccounts: boolean;
  /** Product analytics: always exclude staff roles. Doctor KPIs: false. */
  excludeStaffRoles?: boolean;
};

function readBooleanValueJson(valueJson: unknown): boolean {
  if (valueJson === null || typeof valueJson !== "object") return false;
  const v = (valueJson as Record<string, unknown>).value;
  return v === true || v === "true";
}

type SettingsReader = {
  getSetting(
    key: "dev_mode" | "debug_forward_to_admin",
    scope: "admin",
  ): Promise<SystemSetting | null>;
};

/**
 * Test users are included in analytics only when dev_mode or debug_forward_to_admin is on.
 */
export async function readAnalyticsIncludeTestAccounts(deps: {
  systemSettings: SettingsReader;
}): Promise<boolean> {
  const now = Date.now();
  if (includeTestCache && includeTestCache.expiresAt > now) {
    return includeTestCache.value;
  }
  try {
    const [devRow, debugRow] = await Promise.all([
      deps.systemSettings.getSetting("dev_mode", "admin"),
      deps.systemSettings.getSetting("debug_forward_to_admin", "admin"),
    ]);
    const value =
      readBooleanValueJson(devRow?.valueJson ?? null) ||
      readBooleanValueJson(debugRow?.valueJson ?? null);
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

async function readTestAccountIdentifiersFromDb(
  db: ReturnType<typeof getDrizzle>,
): Promise<ReturnType<typeof normalizeTestAccountIdentifiersValue>> {
  const [row] = await db
    .select({ valueJson: systemSettings.valueJson })
    .from(systemSettings)
    .where(and(eq(systemSettings.key, "test_account_identifiers"), eq(systemSettings.scope, "admin")))
    .limit(1);
  if (!row?.valueJson || typeof row.valueJson !== "object") return null;
  const inner = (row.valueJson as Record<string, unknown>).value;
  return normalizeTestAccountIdentifiersValue(inner);
}

/**
 * Resolves platform user ids to exclude from analytics aggregates.
 */
export async function resolveAnalyticsExcludedUserIds(
  db: ReturnType<typeof getDrizzle>,
  options: ResolveExcludedUserIdsOptions,
): Promise<string[]> {
  const excluded = new Set<string>();

  if (options.excludeStaffRoles !== false) {
    const staffRows = await db
      .select({ id: platformUsers.id })
      .from(platformUsers)
      .where(inArray(platformUsers.role, [...STAFF_ANALYTICS_ROLES]));
    for (const row of staffRows) excluded.add(row.id);
  }

  const alwaysExcludedPhoneRows = await db
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(inArray(platformUsers.phoneNormalized, [...ALWAYS_EXCLUDED_ANALYTICS_PHONES]));
  for (const row of alwaysExcludedPhoneRows) excluded.add(row.id);

  if (options.includeTestAccounts) {
    return [...excluded];
  }

  const spec = await readTestAccountIdentifiersFromDb(db);
  if (!spec) return [...excluded];

  const phoneRowsPromise =
    spec.phones.length > 0
      ? db
          .select({ id: platformUsers.id })
          .from(platformUsers)
          .where(inArray(platformUsers.phoneNormalized, spec.phones))
      : Promise.resolve([] as Array<{ id: string }>);
  const telegramRowsPromise =
    spec.telegramIds.length > 0
      ? db
          .select({ id: userChannelBindings.userId })
          .from(userChannelBindings)
          .where(
            and(
              eq(userChannelBindings.channelCode, "telegram"),
              inArray(userChannelBindings.externalId, spec.telegramIds),
            ),
          )
      : Promise.resolve([] as Array<{ id: string }>);
  const maxRowsPromise =
    spec.maxIds.length > 0
      ? db
          .select({ id: userChannelBindings.userId })
          .from(userChannelBindings)
          .where(
            and(eq(userChannelBindings.channelCode, "max"), inArray(userChannelBindings.externalId, spec.maxIds)),
          )
      : Promise.resolve([] as Array<{ id: string }>);

  const [phoneRows, telegramRows, maxRows] = await Promise.all([
    phoneRowsPromise,
    telegramRowsPromise,
    maxRowsPromise,
  ]);
  for (const row of phoneRows) excluded.add(row.id);
  for (const row of telegramRows) excluded.add(row.id);
  for (const row of maxRows) excluded.add(row.id);
  return [...excluded];
}

export async function loadAnalyticsAudienceContext(deps: {
  systemSettings: SettingsReader;
  excludeStaffRoles?: boolean;
}): Promise<AnalyticsAudienceContext> {
  const includeTestAccounts = await readAnalyticsIncludeTestAccounts(deps);
  const db = getDrizzle();
  const excludedUserIds = await resolveAnalyticsExcludedUserIds(db, {
    includeTestAccounts,
    excludeStaffRoles: deps.excludeStaffRoles,
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
  return notInArray(column, excludedUserIds);
}

/**
 * Drizzle `sql` fragment: `uuid1, uuid2, …` for `NOT IN (...)`.
 * Do not use `<> ALL(${excludedUserIds}::uuid[])` in drizzle templates — pg driver gets a scalar, not uuid[].
 */
export function drizzleSqlUuidInList(excludedUserIds: string[]): SQL {
  return sql.join(excludedUserIds.map((id) => sql`${id}::uuid`), sql`, `);
}
