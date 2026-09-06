import { and, countDistinct, count, desc, eq, exists, gte, lt, sql, type Column } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { programActionLog } from '../../../db/schema/programActionLog';
import { treatmentProgramInstances } from '../../../db/schema/treatmentProgramInstances';
import { platformUsers, userIdentity } from '../../../db/schema/schema';
import { drizzleFioCols, drizzleUserIdentityFioJoin } from '@/infra/repos/userIdentityFioSql';
import { formatDoctorFio } from '@/shared/lib/fio';
import { drizzleExcludeUserIdColumn } from '@/modules/analytics/analyticsAudience';
import { buildPatientVisibilityPredicate } from '@/infra/repos/patientVisibilityPredicateSql';
import { localCalendarDateSql } from '@/infra/repos/localCalendarDateSql';
import { enumerateLocalDayKeysInclusive } from '@/modules/admin-platform-stats/registrationTimeRange';
import type {
  DoctorProgramActivityAudience,
  DoctorProgramActivityKpis,
  DoctorProgramActivityPeriod,
  DoctorProgramActivityPort,
  ProgramActivityDayPoint,
  ProgramActivityPatientRow,
} from '@/modules/doctor-program-activity/ports';

function excludedUsersCond(column: Column, excludedUserIds: string[]) {
  return drizzleExcludeUserIdColumn(column, excludedUserIds);
}

/** `program_action_log` scoped to org + visible patients + `action_type = 'done'` in `[from, toExclusive)`. */
function doneInPeriodCond(period: DoctorProgramActivityPeriod, audience: DoctorProgramActivityAudience) {
  const base = and(
    eq(programActionLog.organizationId, audience.organizationId),
    eq(programActionLog.actionType, 'done'),
    gte(programActionLog.createdAt, period.from),
    lt(programActionLog.createdAt, period.toExclusive),
    excludedUsersCond(programActionLog.patientUserId, audience.excludedUserIds ?? []),
  );
  return buildPatientVisibilityPredicate(
    base!,
    'program_action_log.patient_user_id',
    audience.organizationId,
    audience.visibilityActor,
  );
}

function activeProgramExistsCond(
  db: ReturnType<typeof getDrizzle>,
  audience: DoctorProgramActivityAudience,
) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(treatmentProgramInstances)
      .where(
        and(
          eq(treatmentProgramInstances.organizationId, audience.organizationId),
          eq(treatmentProgramInstances.patientUserId, programActionLog.patientUserId),
          eq(treatmentProgramInstances.status, 'active'),
        ),
      ),
  );
}

export function createPgDoctorProgramActivityPort(): DoctorProgramActivityPort {
  return {
    async getActivityKpis(
      period: DoctorProgramActivityPeriod,
      audience: DoctorProgramActivityAudience,
    ): Promise<DoctorProgramActivityKpis> {
      const db = getDrizzle();
      const activeProgramCond = buildPatientVisibilityPredicate(
        and(
          eq(treatmentProgramInstances.organizationId, audience.organizationId),
          eq(treatmentProgramInstances.status, 'active'),
          excludedUsersCond(treatmentProgramInstances.patientUserId, audience.excludedUserIds ?? []),
        )!,
        'treatment_program_instances.patient_user_id',
        audience.organizationId,
        audience.visibilityActor,
      );
      const localDay = localCalendarDateSql(programActionLog.createdAt, period.displayIana);

      const [activeProgramRow, activityRow] = await Promise.all([
        db
          .select({ c: countDistinct(treatmentProgramInstances.patientUserId) })
          .from(treatmentProgramInstances)
          .where(activeProgramCond),
        db
          .select({
            patients: countDistinct(programActionLog.patientUserId),
            done: count(),
            days: sql<number>`count(distinct ${localDay})::int`.mapWith(Number),
          })
          .from(programActionLog)
          .where(and(doneInPeriodCond(period, audience), activeProgramExistsCond(db, audience))),
      ]);

      const patientsWithActiveProgram = activeProgramRow[0]?.c ?? 0;
      const patientsWithActivityInPeriod = activityRow[0]?.patients ?? 0;
      return {
        patientsWithActiveProgram,
        patientsWithActivityInPeriod,
        doneCountInPeriod: activityRow[0]?.done ?? 0,
        daysWithActivityInPeriod: activityRow[0]?.days ?? 0,
        activePatientShare:
          patientsWithActiveProgram > 0
            ? patientsWithActivityInPeriod / patientsWithActiveProgram
            : 0,
      };
    },

    async getActivityDailySeries(
      period: DoctorProgramActivityPeriod,
      audience: DoctorProgramActivityAudience,
    ): Promise<ProgramActivityDayPoint[]> {
      const db = getDrizzle();
      const localDay = localCalendarDateSql(programActionLog.createdAt, period.displayIana);
      const rows = await db
        .select({
          day: sql<string>`${localDay}::text`,
          doneCount: count(),
          activePatientsCount: countDistinct(programActionLog.patientUserId),
        })
        .from(programActionLog)
        .where(and(doneInPeriodCond(period, audience), activeProgramExistsCond(db, audience)))
        .groupBy(sql`1`);

      const byDay = new Map(rows.map((r) => [r.day, r]));
      return enumerateLocalDayKeysInclusive(period.displayIana, period.fromDay, period.toDay).map(
        (day) => ({
          day,
          doneCount: byDay.get(day)?.doneCount ?? 0,
          activePatientsCount: byDay.get(day)?.activePatientsCount ?? 0,
        }),
      );
    },

    async listPatientsWithActivity(
      period: DoctorProgramActivityPeriod,
      audience: DoctorProgramActivityAudience,
      limit: number,
      offset: number,
    ): Promise<{ items: ProgramActivityPatientRow[]; hasMore: boolean }> {
      const db = getDrizzle();
      const rows = await db
        .select({
          patientUserId: programActionLog.patientUserId,
          doneCountInPeriod: count(),
          lastDoneAtIso: sql<string>`max(${programActionLog.createdAt})`,
          displayName: drizzleFioCols.displayName,
          firstName: drizzleFioCols.firstName,
          lastName: drizzleFioCols.lastName,
          patronymic: drizzleFioCols.patronymic,
        })
        .from(programActionLog)
        .leftJoin(platformUsers, eq(platformUsers.id, programActionLog.patientUserId))
        .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
        .where(and(doneInPeriodCond(period, audience), activeProgramExistsCond(db, audience)))
        .groupBy(
          programActionLog.patientUserId,
          drizzleFioCols.displayName,
          drizzleFioCols.firstName,
          drizzleFioCols.lastName,
          drizzleFioCols.patronymic,
        )
        .orderBy(desc(sql`max(${programActionLog.createdAt})`))
        .limit(limit + 1)
        .offset(offset);

      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;
      return {
        hasMore,
        items: sliced.map((r) => ({
          patientUserId: r.patientUserId,
          displayName:
            formatDoctorFio(
              { lastName: r.lastName, firstName: r.firstName, patronymic: r.patronymic },
              r.displayName,
            ) || 'Пациент',
          doneCountInPeriod: r.doneCountInPeriod,
          lastDoneAtIso: r.lastDoneAtIso,
        })),
      };
    },
  };
}
