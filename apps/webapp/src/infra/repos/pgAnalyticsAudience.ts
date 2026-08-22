import { and, eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import type { AnalyticsTestAccountSpec } from '@/modules/analytics/analyticsAudience';
import type { TestAccountIdentifiers } from '@/modules/system-settings/testAccounts';
import { platformUsers, userChannelBindings } from '../../../db/schema/schema';
import { drizzlePrimaryPhoneCol } from '@/infra/repos/userContactsSql';

/** Единственное определение «служебной учётки» — им пользуются и обычные поверхности, и корень платформенной аналитики. */
export const STAFF_ANALYTICS_ROLES = ['admin', 'doctor'] as const;
export const ALWAYS_EXCLUDED_ANALYTICS_PHONES = ['+70000000000'] as const;

/**
 * `p_audience_json` для платформенных корней — ОДНА сборка на все двери. Форма разбирается телом
 * SQL-функции (`excludeStaffRoles` / `staffRoles` / `excludedPhones` / `telegramIds` / `maxIds`), и
 * вторая копия сборки означала бы вторую копию контракта: разъедется та, о которой забыли.
 *
 * `excludeStaffRoles` — параметр, а не константа: платформенный дашборд считает продуктовую
 * активность и персонал из неё убирает, а счётчики регистраций и подписчиков считают строки
 * `role = 'client'`, где сотрудников нет по определению, и убирать их незачем.
 */
export function platformAudienceJson(
  audience: AnalyticsTestAccountSpec,
  options: { excludeStaffRoles: boolean },
): string {
  return JSON.stringify({
    excludeStaffRoles: options.excludeStaffRoles,
    staffRoles: [...STAFF_ANALYTICS_ROLES],
    excludedPhones: [...ALWAYS_EXCLUDED_ANALYTICS_PHONES, ...audience.testPhones],
    telegramIds: audience.testTelegramIds,
    maxIds: audience.testMaxIds,
  });
}

export type ResolveExcludedUserIdsOptions = {
  includeTestAccounts: boolean;
  /** Product analytics: always exclude staff roles. Doctor KPIs: false. */
  excludeStaffRoles?: boolean;
  testAccountIdentifiers?: TestAccountIdentifiers | null;
};

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
    .where(inArray(drizzlePrimaryPhoneCol, [...ALWAYS_EXCLUDED_ANALYTICS_PHONES]));
  for (const row of alwaysExcludedPhoneRows) excluded.add(row.id);

  if (options.includeTestAccounts) {
    return [...excluded];
  }

  const spec = options.testAccountIdentifiers ?? null;
  if (!spec) return [...excluded];

  const phoneRowsPromise =
    spec.phones.length > 0
      ? db
          .select({ id: platformUsers.id })
          .from(platformUsers)
          .where(inArray(drizzlePrimaryPhoneCol, spec.phones))
      : Promise.resolve([] as Array<{ id: string }>);
  const telegramRowsPromise =
    spec.telegramIds.length > 0
      ? db
          .select({ id: userChannelBindings.userId })
          .from(userChannelBindings)
          .where(
            and(
              eq(userChannelBindings.channelCode, 'telegram'),
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
            and(
              eq(userChannelBindings.channelCode, 'max'),
              inArray(userChannelBindings.externalId, spec.maxIds),
            ),
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
