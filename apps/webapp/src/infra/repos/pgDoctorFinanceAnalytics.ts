import { DateTime } from 'luxon';
import { and, eq, gte, inArray, isNull, lt, notInArray, or, sql, type Column } from 'drizzle-orm';

import { getDrizzle } from '@/app-layer/db/drizzle';
import { beAppointments, beBranches, beClinicServices } from '../../../db/schema/bookingEngine';
import { bePayments } from '../../../db/schema/bookingPayments';
import { patientPayment } from '../../../db/schema/patientPayments';
import type {
  DoctorFinanceAnalytics,
  DoctorFinanceAnalyticsAudience,
  DoctorFinanceAnalyticsPeriod,
  DoctorFinanceAnalyticsPort,
  DoctorFinanceBreakdownRow,
  DoctorFinanceSeriesPoint,
} from '@/modules/doctor-finance-analytics/ports';

type MoneyRow = {
  id: string;
  amountMinor: number;
  occurredAt: string;
  channel: 'online' | 'cash';
  membership: boolean;
  serviceKey: string;
  serviceLabel: string;
  branchKey: string;
  branchLabel: string;
};

function excludedPatientCondition(column: Column, excluded: string[]) {
  return excluded.length > 0 ? or(isNull(column), notInArray(column, excluded)) : undefined;
}

function addBreakdown(
  target: Map<string, DoctorFinanceBreakdownRow>,
  key: string,
  label: string,
  amountMinor: number,
) {
  const current = target.get(key);
  target.set(key, { key, label, amountMinor: (current?.amountMinor ?? 0) + amountMinor });
}

function bucketStart(occurredAt: string, period: DoctorFinanceAnalyticsPeriod): string {
  const local = DateTime.fromISO(occurredAt, { setZone: true }).setZone(period.displayIana);
  return (period.bucket === 'month' ? local.startOf('month') : local.startOf('week')).toISODate()!;
}

function aggregate(rows: MoneyRow[], period: DoctorFinanceAnalyticsPeriod): DoctorFinanceAnalytics {
  const services = new Map<string, DoctorFinanceBreakdownRow>();
  const branches = new Map<string, DoctorFinanceBreakdownRow>();
  const series = new Map<string, DoctorFinanceSeriesPoint>();
  let onlineMinor = 0;
  let cashMinor = 0;
  let membershipMinor = 0;

  for (const row of rows) {
    if (row.channel === 'online') onlineMinor += row.amountMinor;
    else cashMinor += row.amountMinor;
    if (row.membership) membershipMinor += row.amountMinor;
    addBreakdown(services, row.serviceKey, row.serviceLabel, row.amountMinor);
    addBreakdown(branches, row.branchKey, row.branchLabel, row.amountMinor);

    const key = bucketStart(row.occurredAt, period);
    const current = series.get(key) ?? {
      bucketStart: key,
      totalMinor: 0,
      onlineMinor: 0,
      cashMinor: 0,
    };
    current.totalMinor += row.amountMinor;
    current[`${row.channel}Minor`] += row.amountMinor;
    series.set(key, current);
  }

  const byAmount = (a: DoctorFinanceBreakdownRow, b: DoctorFinanceBreakdownRow) =>
    b.amountMinor - a.amountMinor || a.label.localeCompare(b.label, 'ru');
  return {
    currency: 'RUB',
    totalMinor: onlineMinor + cashMinor,
    membershipMinor,
    onlineMinor,
    cashMinor,
    series: [...series.values()].sort((a, b) => a.bucketStart.localeCompare(b.bucketStart)),
    byService: [...services.values()].sort(byAmount),
    byBranch: [...branches.values()].sort(byAmount),
  };
}

export function createPgDoctorFinanceAnalyticsPort(): DoctorFinanceAnalyticsPort {
  return {
    async getFinanceAnalytics(period, audience) {
      const db = getDrizzle();
      const specialistCondition = audience.canManageAllSpecialists
        ? undefined
        : audience.specialistId
          ? eq(beAppointments.specialistId, audience.specialistId)
          : sql`false`;
      const branchCondition = audience.branchId
        ? eq(beAppointments.branchId, audience.branchId)
        : undefined;
      const deliveryCondition = audience.onlineOnly
        ? eq(beAppointments.deliveryFormat, 'online')
        : undefined;

      const [onlineRows, staffRows] = await Promise.all([
        db
          .select({
            id: bePayments.id,
            amountMinor: bePayments.amountMinor,
            occurredAt: bePayments.capturedAt,
            purpose: bePayments.purpose,
            serviceId: beClinicServices.id,
            serviceTitle: beClinicServices.title,
            branchId: beBranches.id,
            branchTitle: beBranches.title,
          })
          .from(bePayments)
          .leftJoin(beAppointments, eq(beAppointments.id, bePayments.appointmentId))
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .where(
            and(
              eq(bePayments.organizationId, audience.organizationId),
              inArray(bePayments.status, ['captured', 'partially_refunded']),
              gte(bePayments.capturedAt, period.from),
              lt(bePayments.capturedAt, period.toExclusive),
              specialistCondition,
              branchCondition,
              deliveryCondition,
              excludedPatientCondition(bePayments.platformUserId, audience.excludedUserIds ?? []),
            ),
          ),
        db
          .select({
            id: patientPayment.id,
            amountMinor: patientPayment.amountMinor,
            occurredAt: patientPayment.createdAt,
            kind: patientPayment.kind,
            patientPackageId: patientPayment.patientPackageId,
            service: patientPayment.service,
            serviceId: beClinicServices.id,
            serviceTitle: beClinicServices.title,
            branchId: beBranches.id,
            branchTitle: beBranches.title,
          })
          .from(patientPayment)
          .leftJoin(beAppointments, eq(beAppointments.id, patientPayment.appointmentId))
          .leftJoin(beClinicServices, eq(beClinicServices.id, beAppointments.serviceId))
          .leftJoin(beBranches, eq(beBranches.id, beAppointments.branchId))
          .where(
            and(
              eq(patientPayment.organizationId, audience.organizationId),
              eq(patientPayment.status, 'paid'),
              gte(patientPayment.createdAt, period.from),
              lt(patientPayment.createdAt, period.toExclusive),
              audience.canManageAllSpecialists
                ? undefined
                : or(specialistCondition, eq(patientPayment.createdBy, audience.staffUserId)),
              branchCondition,
              deliveryCondition,
              excludedPatientCondition(
                patientPayment.patientUserId,
                audience.excludedUserIds ?? [],
              ),
            ),
          ),
      ]);

      const rows: MoneyRow[] = [
        ...onlineRows.map((row) => {
          const membership = row.purpose === 'package_purchase';
          return {
            id: row.id,
            amountMinor: row.amountMinor,
            occurredAt: row.occurredAt,
            channel: 'online' as const,
            membership,
            serviceKey: membership ? 'membership' : (row.serviceId ?? 'without-service'),
            serviceLabel: membership ? 'Абонементы' : (row.serviceTitle ?? 'Без услуги'),
            branchKey: row.branchId ?? 'without-branch',
            branchLabel: row.branchTitle ?? 'Без филиала',
          };
        }),
        ...staffRows.map((row) => {
          const membership = row.patientPackageId !== null;
          return {
            id: row.id,
            amountMinor: row.amountMinor,
            occurredAt: row.occurredAt,
            channel: row.kind === 'cash' ? ('cash' as const) : ('online' as const),
            membership,
            serviceKey: membership
              ? 'membership'
              : (row.serviceId ?? row.service ?? 'without-service'),
            serviceLabel: membership
              ? 'Абонементы'
              : (row.serviceTitle ?? row.service ?? 'Без услуги'),
            branchKey: row.branchId ?? 'without-branch',
            branchLabel: row.branchTitle ?? 'Без филиала',
          };
        }),
      ];

      return aggregate(rows, period);
    },
  };
}
