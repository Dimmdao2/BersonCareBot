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
  UpsertBookingPolicyInput,
} from '@/modules/booking-policies/ports';
import {
  withDefaultBookingPolicy,
} from '@/modules/booking-policies/service';
import type {
  BookingPolicy,
  CancellationPolicy,
  PolicyAppointmentContext,
  ReschedulePolicy,
} from '@/modules/booking-policies/types';

function combinePolicies(
  organizationId: string,
  cancellation: CancellationPolicy | null,
  reschedule: ReschedulePolicy | null,
): BookingPolicy {
  const fallback = withDefaultBookingPolicy(null, organizationId);
  return {
    organizationId,
    cancellationPolicyId: cancellation?.id ?? null,
    reschedulePolicyId: reschedule?.id ?? null,
    title: cancellation?.title ?? reschedule?.title ?? fallback.title,
    cancellationAllowed:
      cancellation === null
        ? fallback.cancellationAllowed
        : cancellation.isActive && cancellation.cancellationAllowed,
    rescheduleAllowed: reschedule?.isActive ?? fallback.rescheduleAllowed,
    freeChangeHoursBefore:
      cancellation?.freeCancelHoursBefore ??
      reschedule?.selfRescheduleHoursBefore ??
      fallback.freeChangeHoursBefore,
    lateChangeBehavior: cancellation?.lateCancellationBehavior ?? fallback.lateChangeBehavior,
    refundPrepaymentOnLate:
      cancellation?.refundPrepaymentOnLate ?? fallback.refundPrepaymentOnLate,
    chargePackageSessionOnLate:
      cancellation?.chargePackageSessionOnLate ?? fallback.chargePackageSessionOnLate,
    requiresStaffConfirmation:
      cancellation?.requiresStaffConfirmation ??
      reschedule?.requiresStaffConfirmation ??
      fallback.requiresStaffConfirmation,
    notifyPatient: cancellation?.notifyPatient ?? reschedule?.notifyPatient ?? fallback.notifyPatient,
    notifyStaff: cancellation?.notifyStaff ?? reschedule?.notifyStaff ?? fallback.notifyStaff,
  };
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
    async getBookingPolicy(organizationId) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        const [cancelRows, rescheduleRows] = await Promise.all([
          readCurrentPatientPolicies<CurrentPatientCancellationPolicyRow>('cancellation'),
          readCurrentPatientPolicies<CurrentPatientReschedulePolicyRow>('reschedule'),
        ]);
        const cancellation =
          cancelRows
            .map(mapCurrentPatientCancellationPolicy)
            .find((policy) => policy.scopeLevel === 'organization') ?? null;
        const reschedule =
          rescheduleRows
            .map(mapCurrentPatientReschedulePolicy)
            .find((policy) => policy.scopeLevel === 'organization') ?? null;
        if (
          cancellation?.organizationId !== undefined &&
          cancellation.organizationId !== organizationId
        ) {
          throw new Error('ambiguous_booking_tenant');
        }
        if (reschedule?.organizationId !== undefined && reschedule.organizationId !== organizationId) {
          throw new Error('ambiguous_booking_tenant');
        }
        return combinePolicies(organizationId, cancellation, reschedule);
      }

      const db = getDrizzle();
      const [cancelRows, rescheduleRows] = await Promise.all([
        db
          .select()
          .from(beCancellationPolicies)
          .where(eq(beCancellationPolicies.organizationId, organizationId))
          .orderBy(asc(beCancellationPolicies.sortOrder), asc(beCancellationPolicies.title)),
        db
          .select()
          .from(beReschedulePolicies)
          .where(eq(beReschedulePolicies.organizationId, organizationId))
          .orderBy(asc(beReschedulePolicies.sortOrder), asc(beReschedulePolicies.title)),
      ]);
      const cancellationRow = cancelRows.find((row) => row.scopeLevel === 'organization');
      const rescheduleRow = rescheduleRows.find((row) => row.scopeLevel === 'organization');
      return combinePolicies(
        organizationId,
        cancellationRow ? mapCancel(cancellationRow) : null,
        rescheduleRow ? mapReschedule(rescheduleRow) : null,
      );
    },

    async upsertBookingPolicy(input: UpsertBookingPolicyInput) {
      const now = new Date().toISOString();
      return runWebappTransaction(async (tx) => {
        const [cancelRows, rescheduleRows] = await Promise.all([
          tx
            .select()
            .from(beCancellationPolicies)
            .where(eq(beCancellationPolicies.organizationId, input.organizationId))
            .for('update'),
          tx
            .select()
            .from(beReschedulePolicies)
            .where(eq(beReschedulePolicies.organizationId, input.organizationId))
            .for('update'),
        ]);
        const storedCancellation = cancelRows.find((row) => row.scopeLevel === 'organization');
        const storedReschedule = rescheduleRows.find((row) => row.scopeLevel === 'organization');

        let cancellationRow: typeof beCancellationPolicies.$inferSelect;
        if (storedCancellation) {
          const [updated] = await tx
            .update(beCancellationPolicies)
            .set({
              title: input.title,
              isActive: true,
              freeCancelHoursBefore: input.freeChangeHoursBefore,
              cancellationAllowed: input.cancellationAllowed,
              lateCancellationBehavior: input.lateChangeBehavior,
              refundPrepaymentOnLate: input.refundPrepaymentOnLate,
              chargePackageSessionOnLate: input.chargePackageSessionOnLate,
              requiresStaffConfirmation: input.requiresStaffConfirmation,
              notifyPatient: input.notifyPatient,
              notifyStaff: input.notifyStaff,
              updatedAt: now,
            })
            .where(eq(beCancellationPolicies.id, storedCancellation.id))
            .returning();
          cancellationRow = updated!;
        } else {
          const [inserted] = await tx
            .insert(beCancellationPolicies)
            .values({
              organizationId: input.organizationId,
              scopeLevel: 'organization',
              scopeEntityId: input.organizationId,
              title: input.title,
              isActive: true,
              freeCancelHoursBefore: input.freeChangeHoursBefore,
              cancellationAllowed: input.cancellationAllowed,
              lateCancellationBehavior: input.lateChangeBehavior,
              refundPrepaymentOnLate: input.refundPrepaymentOnLate,
              chargePackageSessionOnLate: input.chargePackageSessionOnLate,
              requiresStaffConfirmation: input.requiresStaffConfirmation,
              notifyPatient: input.notifyPatient,
              notifyStaff: input.notifyStaff,
              sortOrder: 0,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          cancellationRow = inserted!;
        }

        let rescheduleRow: typeof beReschedulePolicies.$inferSelect;
        if (storedReschedule) {
          const [updated] = await tx
            .update(beReschedulePolicies)
            .set({
              title: input.title,
              isActive: input.rescheduleAllowed,
              selfRescheduleHoursBefore: input.freeChangeHoursBefore,
              requiresStaffConfirmation: input.requiresStaffConfirmation,
              notifyPatient: input.notifyPatient,
              notifyStaff: input.notifyStaff,
              updatedAt: now,
            })
            .where(eq(beReschedulePolicies.id, storedReschedule.id))
            .returning();
          rescheduleRow = updated!;
        } else {
          const [inserted] = await tx
            .insert(beReschedulePolicies)
            .values({
              organizationId: input.organizationId,
              scopeLevel: 'organization',
              scopeEntityId: input.organizationId,
              title: input.title,
              isActive: input.rescheduleAllowed,
              selfRescheduleHoursBefore: input.freeChangeHoursBefore,
              maxSelfReschedules: 1,
              allowDifferentBranch: false,
              allowDifferentCity: false,
              allowDifferentSpecialist: false,
              allowDifferentService: false,
              limitExceededBehavior: 'manual_request',
              requiresStaffConfirmation: input.requiresStaffConfirmation,
              notifyPatient: input.notifyPatient,
              notifyStaff: input.notifyStaff,
              sortOrder: 0,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          rescheduleRow = inserted!;
        }

        return combinePolicies(
          input.organizationId,
          mapCancel(cancellationRow),
          mapReschedule(rescheduleRow),
        );
      });
    },

    async resolveBookingPolicy(ctx) {
      return this.getBookingPolicy(ctx.organizationId);
    },
  };
}
