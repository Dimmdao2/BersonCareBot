import { and, eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import type { TestAccountIdentifiers } from '@/modules/system-settings/testAccounts';
import { platformUsers, userChannelBindings } from '../../../db/schema/schema';

/** Единственное определение «служебной учётки» — им пользуются и обычные поверхности, и корень платформенной аналитики. */
export const STAFF_ANALYTICS_ROLES = ['admin', 'doctor'] as const;
export const ALWAYS_EXCLUDED_ANALYTICS_PHONES = ['+70000000000'] as const;

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
    .where(inArray(platformUsers.phoneNormalized, [...ALWAYS_EXCLUDED_ANALYTICS_PHONES]));
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
          .where(inArray(platformUsers.phoneNormalized, spec.phones))
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
