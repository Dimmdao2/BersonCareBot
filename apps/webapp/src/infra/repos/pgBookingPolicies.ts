import { and, asc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  beCancellationPolicies,
  beReschedulePolicies,
} from "../../../db/schema/bookingPolicies";
import type { BookingPoliciesPort, UpsertCancellationPolicyInput, UpsertReschedulePolicyInput } from "@/modules/booking-policies/ports";
import {
  resolveCancellationFromList,
  resolveRescheduleFromList,
  withDefaultCancellationPolicy,
  withDefaultReschedulePolicy,
} from "@/modules/booking-policies/service";
import type {
  CancellationPolicy,
  PolicyAppointmentContext,
  ReschedulePolicy,
} from "@/modules/booking-policies/types";

function normalizeScopeEntityId(scopeLevel: string, scopeEntityId: string | null, organizationId: string): string | null {
  if (scopeLevel === "organization") return scopeEntityId ?? organizationId;
  return scopeEntityId;
}

function mapCancel(row: typeof beCancellationPolicies.$inferSelect): CancellationPolicy {
  return {
    id: row.id,
    organizationId: row.organizationId,
    scopeLevel: row.scopeLevel as CancellationPolicy["scopeLevel"],
    scopeEntityId: row.scopeEntityId ?? null,
    title: row.title,
    isActive: row.isActive,
    freeCancelHoursBefore: row.freeCancelHoursBefore,
    cancellationAllowed: row.cancellationAllowed,
    lateCancellationBehavior: row.lateCancellationBehavior as CancellationPolicy["lateCancellationBehavior"],
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
    scopeLevel: row.scopeLevel as ReschedulePolicy["scopeLevel"],
    scopeEntityId: row.scopeEntityId ?? null,
    title: row.title,
    isActive: row.isActive,
    selfRescheduleHoursBefore: row.selfRescheduleHoursBefore,
    maxSelfReschedules: row.maxSelfReschedules,
    allowDifferentBranch: row.allowDifferentBranch,
    allowDifferentCity: row.allowDifferentCity,
    allowDifferentSpecialist: row.allowDifferentSpecialist,
    allowDifferentService: row.allowDifferentService,
    limitExceededBehavior: row.limitExceededBehavior as ReschedulePolicy["limitExceededBehavior"],
    requiresStaffConfirmation: row.requiresStaffConfirmation,
    notifyPatient: row.notifyPatient,
    notifyStaff: row.notifyStaff,
    sortOrder: row.sortOrder,
  };
}

export function createPgBookingPoliciesPort(): BookingPoliciesPort {
  return {
    async listCancellationPolicies(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beCancellationPolicies)
        .where(eq(beCancellationPolicies.organizationId, organizationId))
        .orderBy(asc(beCancellationPolicies.sortOrder), asc(beCancellationPolicies.title));
      return rows.map(mapCancel);
    },

    async listReschedulePolicies(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beReschedulePolicies)
        .where(eq(beReschedulePolicies.organizationId, organizationId))
        .orderBy(asc(beReschedulePolicies.sortOrder), asc(beReschedulePolicies.title));
      return rows.map(mapReschedule);
    },

    async upsertCancellationPolicy(input: UpsertCancellationPolicyInput) {
      const db = getDrizzle();
      const scopeEntityId = normalizeScopeEntityId(input.scopeLevel, input.scopeEntityId, input.organizationId);
      const now = new Date().toISOString();
      if (input.id) {
        await db
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
              eq(beCancellationPolicies.id, input.id),
              eq(beCancellationPolicies.organizationId, input.organizationId),
            ),
          );
        const rows = await db
          .select()
          .from(beCancellationPolicies)
          .where(eq(beCancellationPolicies.id, input.id))
          .limit(1);
        if (!rows[0]) throw new Error("policy_not_found");
        return mapCancel(rows[0]);
      }
      const inserted = await db
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
        .returning();
      return mapCancel(inserted[0]!);
    },

    async upsertReschedulePolicy(input: UpsertReschedulePolicyInput) {
      const db = getDrizzle();
      const scopeEntityId = normalizeScopeEntityId(input.scopeLevel, input.scopeEntityId, input.organizationId);
      const now = new Date().toISOString();
      if (input.id) {
        await db
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
            and(eq(beReschedulePolicies.id, input.id), eq(beReschedulePolicies.organizationId, input.organizationId)),
          );
        const rows = await db
          .select()
          .from(beReschedulePolicies)
          .where(eq(beReschedulePolicies.id, input.id))
          .limit(1);
        if (!rows[0]) throw new Error("policy_not_found");
        return mapReschedule(rows[0]);
      }
      const inserted = await db
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
        .returning();
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
