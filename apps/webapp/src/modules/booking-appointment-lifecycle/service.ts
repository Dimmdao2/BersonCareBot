import type { BeAppointment } from "@/modules/booking-engine/types";
import type { BookingPoliciesService } from "@/modules/booking-policies/service";
import {
  evaluateCancellationEligibility,
  evaluateRescheduleEligibility,
  freeCancellationAvailableAfterReschedule,
  hoursUntil,
} from "@/modules/booking-policies/policyResolver";
import type { PolicyAppointmentContext } from "@/modules/booking-policies/types";
import type { AppointmentLifecyclePort } from "./ports";

export type PreviewCancelResult =
  | {
      ok: true;
      allowed: boolean;
      isFree: boolean;
      reasonCode: string;
      requiresStaffConfirmation: boolean;
      messageKey: string;
    }
  | { ok: false; error: "not_found" };

export type PreviewRescheduleResult =
  | {
      ok: true;
      allowed: boolean;
      reasonCode: string;
      requiresStaffConfirmation: boolean;
      remainingSelfReschedules: number;
      messageKey: string;
    }
  | { ok: false; error: "not_found" };

function policyContext(appt: BeAppointment): PolicyAppointmentContext {
  return {
    organizationId: appt.organizationId,
    specialistId: appt.specialistId,
    serviceId: appt.serviceId,
    productId: null,
  };
}

export function createBookingAppointmentLifecycleService(deps: {
  lifecyclePort: AppointmentLifecyclePort;
  policies: BookingPoliciesService;
}) {
  return {
    async previewPatientCancel(appointmentId: string, organizationId: string): Promise<PreviewCancelResult> {
      const appt = await deps.lifecyclePort.getAppointment(appointmentId, organizationId);
      if (!appt) return { ok: false, error: "not_found" };
      const cancelPolicy = await deps.policies.resolveCancellationPolicy(policyContext(appt));
      const history = await deps.lifecyclePort.listReschedules(appointmentId, organizationId);
      const referenceStartAt = appt.originalStartAt ?? appt.startAt;
      const eligibility = evaluateCancellationEligibility({
        referenceStartAt,
        policy: cancelPolicy,
        rescheduleHistory: history.map((h) => ({ actorType: h.actorType, createdAt: h.createdAt })),
      });
      return {
        ok: true,
        allowed: eligibility.allowed,
        isFree: eligibility.isFree,
        reasonCode: eligibility.reasonCode,
        requiresStaffConfirmation: eligibility.requiresStaffConfirmation,
        messageKey: cancelMessageKey(eligibility.reasonCode, eligibility.isFree),
      };
    },

    async previewPatientReschedule(appointmentId: string, organizationId: string): Promise<PreviewRescheduleResult> {
      const appt = await deps.lifecyclePort.getAppointment(appointmentId, organizationId);
      if (!appt) return { ok: false, error: "not_found" };
      const reschedulePolicy = await deps.policies.resolveReschedulePolicy(policyContext(appt));
      const eligibility = evaluateRescheduleEligibility({
        currentStartAt: appt.startAt,
        policy: reschedulePolicy,
        rescheduleCount: appt.rescheduleCount,
      });
      return {
        ok: true,
        allowed: eligibility.allowed,
        reasonCode: eligibility.reasonCode,
        requiresStaffConfirmation: eligibility.requiresStaffConfirmation,
        remainingSelfReschedules: eligibility.remainingSelfReschedules,
        messageKey: rescheduleMessageKey(eligibility.reasonCode),
      };
    },

    async patientReschedule(input: {
      appointmentId: string;
      organizationId: string;
      userId: string;
      newStartAt: string;
      newEndAt: string;
      durationMinutes: number;
      reason?: string;
      branchId?: string | null;
      specialistId?: string | null;
      serviceId?: string | null;
      cityCode?: string | null;
      notificationsSent?: Record<string, unknown>;
    }) {
      const appt = await deps.lifecyclePort.getAppointment(input.appointmentId, input.organizationId);
      if (!appt) return { ok: false as const, error: "not_found" as const };
      if (appt.platformUserId !== input.userId) return { ok: false as const, error: "not_found" as const };

      const ctx = policyContext(appt);
      const reschedulePolicy = await deps.policies.resolveReschedulePolicy(ctx);
      const cancelPolicy = await deps.policies.resolveCancellationPolicy(ctx);

      const eligibility = evaluateRescheduleEligibility({
        currentStartAt: appt.startAt,
        policy: reschedulePolicy,
        rescheduleCount: appt.rescheduleCount,
        change: {
          branchId: input.branchId,
          cityCode: input.cityCode,
          specialistId: input.specialistId,
          serviceId: input.serviceId,
        },
        current: {
          branchId: appt.branchId,
          specialistId: appt.specialistId,
          serviceId: appt.serviceId,
        },
      });
      if (!eligibility.allowed) {
        return { ok: false as const, error: eligibility.reasonCode };
      }
      if (eligibility.requiresStaffConfirmation) {
        return { ok: false as const, error: "staff_confirmation_required" };
      }

      const referenceStartAt = appt.originalStartAt ?? appt.startAt;
      const now = new Date();
      const wasInFreeRescheduleWindow = hoursUntil(appt.startAt, now) >= reschedulePolicy.selfRescheduleHoursBefore;
      const freeCancellationAvailableAtReschedule = evaluateCancellationEligibility({
        referenceStartAt,
        policy: cancelPolicy,
        rescheduleHistory: (await deps.lifecyclePort.listReschedules(input.appointmentId, input.organizationId)).map(
          (h) => ({ actorType: h.actorType, createdAt: h.createdAt }),
        ),
        now,
      }).isFree;
      const freeCancellationAvailableAfter = freeCancellationAvailableAfterReschedule({
        referenceStartAt,
        policy: cancelPolicy,
        at: now,
      });

      const updated = await deps.lifecyclePort.applyReschedule({
        appointmentId: input.appointmentId,
        organizationId: input.organizationId,
        newStartAt: input.newStartAt,
        newEndAt: input.newEndAt,
        durationMinutes: input.durationMinutes,
        actorType: "patient",
        actorId: input.userId,
        reason: input.reason,
        manualOverride: false,
        branchId: input.branchId ?? appt.branchId,
        roomId: appt.roomId,
        specialistId: input.specialistId ?? appt.specialistId,
        serviceId: input.serviceId ?? appt.serviceId,
        cityCode: input.cityCode,
        policy: reschedulePolicy,
        cancellationPolicy: cancelPolicy,
        wasInFreeRescheduleWindow,
        freeCancellationAvailableAtReschedule,
        freeCancellationAvailableAfter,
        notificationsSent: input.notificationsSent ?? {
          policy: { notifyPatient: reschedulePolicy.notifyPatient, notifyStaff: reschedulePolicy.notifyStaff },
        },
      });

      return { ok: true as const, appointment: updated, reschedulePolicy };
    },

    async patientCancel(input: {
      appointmentId: string;
      organizationId: string;
      userId: string;
      reason?: string;
      notificationsSent?: Record<string, unknown>;
    }) {
      const appt = await deps.lifecyclePort.getAppointment(input.appointmentId, input.organizationId);
      if (!appt) return { ok: false as const, error: "not_found" as const };
      if (appt.platformUserId !== input.userId) return { ok: false as const, error: "not_found" as const };

      const cancelPolicy = await deps.policies.resolveCancellationPolicy(policyContext(appt));
      const history = await deps.lifecyclePort.listReschedules(input.appointmentId, input.organizationId);
      const referenceStartAt = appt.originalStartAt ?? appt.startAt;
      const eligibility = evaluateCancellationEligibility({
        referenceStartAt,
        policy: cancelPolicy,
        rescheduleHistory: history.map((h) => ({ actorType: h.actorType, createdAt: h.createdAt })),
      });

      if (!eligibility.allowed) return { ok: false as const, error: "not_allowed" as const };
      if (eligibility.requiresStaffConfirmation) {
        return { ok: false as const, error: "staff_confirmation_required" as const };
      }

      const targetStatus: BeAppointment["status"] = eligibility.isFree
        ? "cancelled_by_patient"
        : "late_cancellation";

      const updated = await deps.lifecyclePort.applyCancellation({
        appointmentId: input.appointmentId,
        organizationId: input.organizationId,
        actorType: "patient",
        actorId: input.userId,
        reason: input.reason,
        policy: cancelPolicy,
        wasFree: eligibility.isFree,
        wasPenalized: !eligibility.isFree,
        decisionType: eligibility.decisionType,
        targetStatus,
        packageSessionCharged: false,
        prepaymentRetained: !eligibility.isFree && cancelPolicy.lateCancellationBehavior === "retain_prepayment",
        prepaymentRefunded: !eligibility.isFree && cancelPolicy.lateCancellationBehavior === "refund_prepayment",
        notificationsSent: input.notificationsSent ?? {
          policy: { notifyPatient: cancelPolicy.notifyPatient, notifyStaff: cancelPolicy.notifyStaff },
        },
      });

      return { ok: true as const, appointment: updated, eligibility, cancelPolicy };
    },

    async staffCancel(input: {
      appointmentId: string;
      organizationId: string;
      actorType: "specialist" | "admin";
      actorId: string;
      decisionType: import("@/modules/booking-policies/types").CancellationDecisionType;
      reason?: string;
      staffComment?: string;
      manualOverride?: boolean;
      notificationsSent?: Record<string, unknown>;
    }) {
      const appt = await deps.lifecyclePort.getAppointment(input.appointmentId, input.organizationId);
      if (!appt) return { ok: false as const, error: "not_found" as const };

      const cancelPolicy = await deps.policies.resolveCancellationPolicy(policyContext(appt));
      const wasFree = input.decisionType === "free";
      const targetStatus: BeAppointment["status"] = wasFree
        ? "cancelled_by_specialist"
        : input.decisionType === "penalized"
          ? "late_cancellation"
          : "cancelled_by_specialist";

      const updated = await deps.lifecyclePort.applyCancellation({
        appointmentId: input.appointmentId,
        organizationId: input.organizationId,
        actorType: input.actorType,
        actorId: input.actorId,
        reason: input.reason,
        staffComment: input.staffComment,
        manualOverride: input.manualOverride ?? true,
        decisionType: input.decisionType,
        policy: cancelPolicy,
        wasFree,
        wasPenalized: input.decisionType === "penalized",
        targetStatus,
        packageSessionCharged: input.decisionType === "package_charged",
        prepaymentRetained: input.decisionType === "retain_prepayment",
        prepaymentRefunded: input.decisionType === "refund_prepayment",
        notificationsSent: input.notificationsSent,
      });

      return { ok: true as const, appointment: updated, cancelPolicy };
    },

    async staffReschedule(input: {
      appointmentId: string;
      organizationId: string;
      actorType: "specialist" | "admin";
      actorId: string;
      newStartAt: string;
      newEndAt: string;
      durationMinutes: number;
      reason?: string;
      staffComment?: string;
      manualOverride?: boolean;
      branchId?: string | null;
      specialistId?: string | null;
      serviceId?: string | null;
      notificationsSent?: Record<string, unknown>;
    }) {
      const appt = await deps.lifecyclePort.getAppointment(input.appointmentId, input.organizationId);
      if (!appt) return { ok: false as const, error: "not_found" as const };

      const ctx = policyContext(appt);
      const reschedulePolicy = await deps.policies.resolveReschedulePolicy(ctx);
      const cancelPolicy = await deps.policies.resolveCancellationPolicy(ctx);
      const referenceStartAt = appt.originalStartAt ?? appt.startAt;
      const now = new Date();

      const updated = await deps.lifecyclePort.applyReschedule({
        appointmentId: input.appointmentId,
        organizationId: input.organizationId,
        newStartAt: input.newStartAt,
        newEndAt: input.newEndAt,
        durationMinutes: input.durationMinutes,
        actorType: input.actorType,
        actorId: input.actorId,
        reason: input.reason,
        staffComment: input.staffComment,
        manualOverride: input.manualOverride ?? true,
        branchId: input.branchId ?? appt.branchId,
        roomId: appt.roomId,
        specialistId: input.specialistId ?? appt.specialistId,
        serviceId: input.serviceId ?? appt.serviceId,
        policy: reschedulePolicy,
        cancellationPolicy: cancelPolicy,
        wasInFreeRescheduleWindow: input.manualOverride ?? true,
        freeCancellationAvailableAtReschedule: evaluateCancellationEligibility({
          referenceStartAt,
          policy: cancelPolicy,
          rescheduleHistory: [],
          now,
        }).isFree,
        freeCancellationAvailableAfter: freeCancellationAvailableAfterReschedule({
          referenceStartAt,
          policy: cancelPolicy,
          at: now,
        }),
        notificationsSent: input.notificationsSent,
      });

      return { ok: true as const, appointment: updated, reschedulePolicy };
    },

    patchLatestRescheduleNotifications: deps.lifecyclePort.patchLatestRescheduleNotifications.bind(
      deps.lifecyclePort,
    ),
    patchLatestCancellationNotifications: deps.lifecyclePort.patchLatestCancellationNotifications.bind(
      deps.lifecyclePort,
    ),

    listReschedules: deps.lifecyclePort.listReschedules.bind(deps.lifecyclePort),
    listCancellations: deps.lifecyclePort.listCancellations.bind(deps.lifecyclePort),
  };
}

function cancelMessageKey(reasonCode: string, isFree: boolean): string {
  if (!isFree && reasonCode === "forfeited_by_reschedule") return "cancel_not_free_after_reschedule";
  if (!isFree && reasonCode === "late") return "cancel_late_penalty";
  if (reasonCode === "not_allowed") return "cancel_not_allowed";
  return "cancel_free";
}

function rescheduleMessageKey(reasonCode: string): string {
  if (reasonCode === "too_late") return "reschedule_too_late";
  if (reasonCode === "limit_exceeded") return "reschedule_limit_exceeded";
  if (reasonCode === "change_not_allowed") return "reschedule_change_not_allowed";
  return "reschedule_allowed";
}
