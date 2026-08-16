import { and, asc, eq, sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappTransaction,
} from '@/infra/db/runWebappSql';
import { beCancellationPolicies, beReschedulePolicies } from '../../../db/schema/bookingPolicies';
import type {
  BookingPoliciesPort,
  UpsertCancellationPolicyInput,
  UpsertReschedulePolicyInput,
} from '@/modules/booking-policies/ports';
import {
  resolveCancellationFromList,
  resolveRescheduleFromList,
  withDefaultCancellationPolicy,
  withDefaultReschedulePolicy,
} from '@/modules/booking-policies/service';
import type {
  CancellationPolicy,
  PolicyAppointmentContext,
  ReschedulePolicy,
} from '@/modules/booking-policies/types';

function normalizeScopeEntityId(
  scopeLevel: string,
  scopeEntityId: string | null,
  organizationId: string,
): string | null {
  if (scopeLevel === 'organization') return scopeEntityId ?? organizationId;
  return scopeEntityId;
}

function mapCancel(row: typeof beCancellationPolicies.$inferSelect): CancellationPolicy {
  return {
    id: row.id,
    organizationId: row.organizationId,
    scopeLevel: row.scopeLevel as CancellationPolicy['scopeLevel'],
    scopeEntityId: row.scopeEntityId ?? null,
    title: row.title,
    isActive: row.isActive,
    freeCancelHoursBefore: row.freeCancelHoursBefore,
    cancellationAllowed: row.cancellationAllowed,
    lateCancellationBehavior:
      row.lateCancellationBehavior as CancellationPolicy['lateCancellationBehavior'],
    refundPrepaymentOnLate: row.refundPrepaymentOnLate,
    chargePackageSessionOnLate: row.chargePackageSessionOnLate,
    requiresStaffConfirmation: row.requiresStaffConfirmation,
    notifyPatient: row.notifyPatient,
    notifyStaff: row.notifyStaff,
    sortOrder: row.sortOrder,
  };
}

function mapReschedule(row: typeof beReschedulePolicies.$inferSelect): ReschedulePolicy {
  return {
    id: row.id,
    organizationId: row.organizationId,
    scopeLevel: row.scopeLevel as ReschedulePolicy['scopeLevel'],
    scopeEntityId: row.scopeEntityId ?? null,
    title: row.title,
    isActive: row.isActive,
    selfRescheduleHoursBefore: row.selfRescheduleHoursBefore,
    maxSelfReschedules: row.maxSelfReschedules,
    allowDifferentBranch: row.allowDifferentBranch,
    allowDifferentCity: row.allowDifferentCity,
    allowDifferentSpecialist: row.allowDifferentSpecialist,
    allowDifferentService: row.allowDifferentService,
    limitExceededBehavior: row.limitExceededBehavior as ReschedulePolicy['limitExceededBehavior'],
    requiresStaffConfirmation: row.requiresStaffConfirmation,
    notifyPatient: row.notifyPatient,
    notifyStaff: row.notifyStaff,
    sortOrder: row.sortOrder,
  };
}

type CurrentPatientCancellationPolicyRow = {
  id: string;
  organization_id: string;
  scope_level: string;
  scope_entity_id: string | null;
  title: string;
  is_active: boolean;
  free_cancel_hours_before: number;
  cancellation_allowed: boolean;
  late_cancellation_behavior: string;
  refund_prepayment_on_late: string;
  charge_package_session_on_late: boolean;
  requires_staff_confirmation: boolean;
  notify_patient: boolean;
  notify_staff: boolean;
  sort_order: number;
};

type CurrentPatientReschedulePolicyRow = {
  id: string;
  organization_id: string;
  scope_level: string;
  scope_entity_id: string | null;
  title: string;
  is_active: boolean;
  self_reschedule_hours_before: number;
  max_self_reschedules: number;
  allow_different_branch: boolean;
  allow_different_city: boolean;
  allow_different_specialist: boolean;
  allow_different_service: boolean;
  limit_exceeded_behavior: string;
  requires_staff_confirmation: boolean;
  notify_patient: boolean;
  notify_staff: boolean;
  sort_order: number;
};

async function readCurrentPatientPolicies<T>(kind: 'cancellation' | 'reschedule'): Promise<T[]> {
  const result = await runWebappNamedRoot<{ policies: T[] }>(
    getWebappSqlDb(),
    'app.read_current_patient_booking_policies(text)',
    [kind],
    sql`SELECT app.read_current_patient_booking_policies(${kind}::text) AS policies`,
  );
  return result.rows[0]?.policies ?? [];
}

function mapCurrentPatientCancellationPolicy(
  row: CurrentPatientCancellationPolicyRow,
): CancellationPolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    scopeLevel: row.scope_level as CancellationPolicy['scopeLevel'],
    scopeEntityId: row.scope_entity_id,
    title: row.title,
    isActive: row.is_active,
    freeCancelHoursBefore: row.free_cancel_hours_before,
    cancellationAllowed: row.cancellation_allowed,
    lateCancellationBehavior:
      row.late_cancellation_behavior as CancellationPolicy['lateCancellationBehavior'],
    refundPrepaymentOnLate: row.refund_prepayment_on_late,
    chargePackageSessionOnLate: row.charge_package_session_on_late,
    requiresStaffConfirmation: row.requires_staff_confirmation,
    notifyPatient: row.notify_patient,
    notifyStaff: row.notify_staff,
    sortOrder: row.sort_order,
  };
}

function mapCurrentPatientReschedulePolicy(
  row: CurrentPatientReschedulePolicyRow,
): ReschedulePolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    scopeLevel: row.scope_level as ReschedulePolicy['scopeLevel'],
    scopeEntityId: row.scope_entity_id,
    title: row.title,
    isActive: row.is_active,
    selfRescheduleHoursBefore: row.self_reschedule_hours_before,
    maxSelfReschedules: row.max_self_reschedules,
    allowDifferentBranch: row.allow_different_branch,
    allowDifferentCity: row.allow_different_city,
    allowDifferentSpecialist: row.allow_different_specialist,
    allowDifferentService: row.allow_different_service,
    limitExceededBehavior: row.limit_exceeded_behavior as ReschedulePolicy['limitExceededBehavior'],
    requiresStaffConfirmation: row.requires_staff_confirmation,
    notifyPatient: row.notify_patient,
    notifyStaff: row.notify_staff,
    sortOrder: row.sort_order,
  };
}

export function createPgBookingPoliciesPort(): BookingPoliciesPort {
  return {
    async listCancellationPolicies(organizationId) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        const rows = await readCurrentPatientPolicies<CurrentPatientCancellationPolicyRow>(
          'cancellation',
        );
        const policies = rows.map(mapCurrentPatientCancellationPolicy);
        if (policies.some((policy) => policy.organizationId !== organizationId)) {
          throw new Error('ambiguous_booking_tenant');
        }
        return policies;
      }
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beCancellationPolicies)
        .where(eq(beCancellationPolicies.organizationId, organizationId))
        .orderBy(asc(beCancellationPolicies.sortOrder), asc(beCancellationPolicies.title));
      return rows.map(mapCancel);
    },

    async listReschedulePolicies(organizationId) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        const rows = await readCurrentPatientPolicies<CurrentPatientReschedulePolicyRow>(
          'reschedule',
        );
        const policies = rows.map(mapCurrentPatientReschedulePolicy);
        if (policies.some((policy) => policy.organizationId !== organizationId)) {
          throw new Error('ambiguous_booking_tenant');
        }
        return policies;
      }
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beReschedulePolicies)
        .where(eq(beReschedulePolicies.organizationId, organizationId))
        .orderBy(asc(beReschedulePolicies.sortOrder), asc(beReschedulePolicies.title));
      return rows.map(mapReschedule);
    },

    async upsertCancellationPolicy(input: UpsertCancellationPolicyInput) {
      const scopeEntityId = normalizeScopeEntityId(
        input.scopeLevel,
        input.scopeEntityId,
        input.organizationId,
      );
      const now = new Date().toISOString();
      if (input.id) {
        const id = input.id;
        const row = await runWebappTransaction(async (tx) => {
          await tx
            .update(beCancellationPolicies)
            .set({
              scopeLevel: input.scopeLevel,
              scopeEntityId,
              title: input.title,
              isActive: input.isActive,
              freeCancelHoursBefore: input.freeCancelHoursBefore,
              cancellationAllowed: input.cancellationAllowed,
              lateCancellationBehavior: input.lateCancellationBehavior,
              refundPrepaymentOnLate: input.refundPrepaymentOnLate,
              chargePackageSessionOnLate: input.chargePackageSessionOnLate,
              requiresStaffConfirmation: input.requiresStaffConfirmation,
              notifyPatient: input.notifyPatient,
              notifyStaff: input.notifyStaff,
              sortOrder: input.sortOrder,
              updatedAt: now,
            })
            .where(
              and(
                eq(beCancellationPolicies.id, id),
                eq(beCancellationPolicies.organizationId, input.organizationId),
              ),
            );
          const rows = await tx
            .select()
            .from(beCancellationPolicies)
            .where(eq(beCancellationPolicies.id, id))
            .limit(1);
          return rows[0] ? mapCancel(rows[0]) : null;
        });
        if (!row) throw new Error('policy_not_found');
        return row;
      }
      const inserted = await runWebappTransaction((tx) =>
        tx
          .insert(beCancellationPolicies)
          .values({
            organizationId: input.organizationId,
            scopeLevel: input.scopeLevel,
            scopeEntityId,
            title: input.title,
            isActive: input.isActive,
            freeCancelHoursBefore: input.freeCancelHoursBefore,
            cancellationAllowed: input.cancellationAllowed,
            lateCancellationBehavior: input.lateCancellationBehavior,
            refundPrepaymentOnLate: input.refundPrepaymentOnLate,
            chargePackageSessionOnLate: input.chargePackageSessionOnLate,
            requiresStaffConfirmation: input.requiresStaffConfirmation,
            notifyPatient: input.notifyPatient,
            notifyStaff: input.notifyStaff,
            sortOrder: input.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      );
      return mapCancel(inserted[0]!);
    },

    async upsertReschedulePolicy(input: UpsertReschedulePolicyInput) {
      const scopeEntityId = normalizeScopeEntityId(
        input.scopeLevel,
        input.scopeEntityId,
        input.organizationId,
      );
      const now = new Date().toISOString();
      if (input.id) {
        const id = input.id;
        const row = await runWebappTransaction(async (tx) => {
          await tx
            .update(beReschedulePolicies)
            .set({
              scopeLevel: input.scopeLevel,
              scopeEntityId,
              title: input.title,
              isActive: input.isActive,
              selfRescheduleHoursBefore: input.selfRescheduleHoursBefore,
              maxSelfReschedules: input.maxSelfReschedules,
              allowDifferentBranch: input.allowDifferentBranch,
              allowDifferentCity: input.allowDifferentCity,
              allowDifferentSpecialist: input.allowDifferentSpecialist,
              allowDifferentService: input.allowDifferentService,
              limitExceededBehavior: input.limitExceededBehavior,
              requiresStaffConfirmation: input.requiresStaffConfirmation,
              notifyPatient: input.notifyPatient,
              notifyStaff: input.notifyStaff,
              sortOrder: input.sortOrder,
              updatedAt: now,
            })
            .where(
              and(
                eq(beReschedulePolicies.id, id),
                eq(beReschedulePolicies.organizationId, input.organizationId),
              ),
            );
          const rows = await tx
            .select()
            .from(beReschedulePolicies)
            .where(eq(beReschedulePolicies.id, id))
            .limit(1);
          return rows[0] ? mapReschedule(rows[0]) : null;
        });
        if (!row) throw new Error('policy_not_found');
        return row;
      }
      const inserted = await runWebappTransaction((tx) =>
        tx
          .insert(beReschedulePolicies)
          .values({
            organizationId: input.organizationId,
            scopeLevel: input.scopeLevel,
            scopeEntityId,
            title: input.title,
            isActive: input.isActive,
            selfRescheduleHoursBefore: input.selfRescheduleHoursBefore,
            maxSelfReschedules: input.maxSelfReschedules,
            allowDifferentBranch: input.allowDifferentBranch,
            allowDifferentCity: input.allowDifferentCity,
            allowDifferentSpecialist: input.allowDifferentSpecialist,
            allowDifferentService: input.allowDifferentService,
            limitExceededBehavior: input.limitExceededBehavior,
            requiresStaffConfirmation: input.requiresStaffConfirmation,
            notifyPatient: input.notifyPatient,
            notifyStaff: input.notifyStaff,
            sortOrder: input.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      );
      return mapReschedule(inserted[0]!);
    },

    async resolveCancellationPolicy(ctx) {
      const policies = await this.listCancellationPolicies(ctx.organizationId);
      const picked = resolveCancellationFromList(policies, ctx);
      return withDefaultCancellationPolicy(picked, ctx.organizationId);
    },

    async resolveReschedulePolicy(ctx) {
      const policies = await this.listReschedulePolicies(ctx.organizationId);
      const picked = resolveRescheduleFromList(policies, ctx);
      return withDefaultReschedulePolicy(picked, ctx.organizationId);
    },
  };
}
