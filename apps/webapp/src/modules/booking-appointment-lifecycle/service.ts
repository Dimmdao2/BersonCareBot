import type { AppointmentDeliveryFormat, BeAppointment } from '@/modules/booking-engine/types';
import type { BookingPoliciesService } from '@/modules/booking-policies/service';
import { evaluateBookingActionEligibility } from '@/modules/booking-policies/policyResolver';
import type {
  BookingPolicy,
  CancellationPolicy,
  PolicyAppointmentContext,
  ReschedulePolicy,
} from '@/modules/booking-policies/types';
import type { AppointmentLifecyclePort, AppointmentNoShowRecord } from './ports';

export type PreviewCancelResult =
  | {
      ok: true;
      allowed: boolean;
      isFree: boolean;
      reasonCode: string;
      requiresStaffConfirmation: boolean;
      messageKey: string;
    }
  | { ok: false; error: 'not_found' };

export type PreviewRescheduleResult =
  | {
      ok: true;
      allowed: boolean;
      reasonCode: string;
      requiresStaffConfirmation: boolean;
      isFree: boolean;
      messageKey: string;
    }
  | { ok: false; error: 'not_found' };

function policyContext(appt: BeAppointment): PolicyAppointmentContext {
  return {
    organizationId: appt.organizationId,
    specialistId: appt.specialistId,
    serviceId: appt.serviceId,
    productId: null,
  };
}

function cancellationPolicySnapshot(policy: BookingPolicy): CancellationPolicy {
  return {
    id: policy.cancellationPolicyId ?? 'default',
    organizationId: policy.organizationId,
    scopeLevel: 'organization',
    scopeEntityId: policy.organizationId,
    title: policy.title,
    isActive: true,
    freeCancelHoursBefore: policy.freeChangeHoursBefore,
    cancellationAllowed: policy.cancellationAllowed,
    lateCancellationBehavior: policy.lateChangeBehavior,
    refundPrepaymentOnLate: policy.refundPrepaymentOnLate,
    chargePackageSessionOnLate: policy.chargePackageSessionOnLate,
    requiresStaffConfirmation: policy.requiresStaffConfirmation,
    notifyPatient: policy.notifyPatient,
    notifyStaff: policy.notifyStaff,
    sortOrder: 0,
  };
}

function reschedulePolicySnapshot(policy: BookingPolicy): ReschedulePolicy {
  return {
    id: policy.reschedulePolicyId ?? 'default',
    organizationId: policy.organizationId,
    scopeLevel: 'organization',
    scopeEntityId: policy.organizationId,
    title: policy.title,
    isActive: policy.rescheduleAllowed,
    selfRescheduleHoursBefore: policy.freeChangeHoursBefore,
    maxSelfReschedules: 0,
    allowDifferentBranch: false,
    allowDifferentCity: false,
    allowDifferentSpecialist: false,
    allowDifferentService: false,
    limitExceededBehavior: 'deny',
    requiresStaffConfirmation: policy.requiresStaffConfirmation,
    notifyPatient: policy.notifyPatient,
    notifyStaff: policy.notifyStaff,
    sortOrder: 0,
  };
}

export function createBookingAppointmentLifecycleService(deps: {
  lifecyclePort: AppointmentLifecyclePort;
  policies: BookingPoliciesService;
}) {
  return {
    async previewPatientCancel(
      appointmentId: string,
      organizationId: string,
    ): Promise<PreviewCancelResult> {
      const appt = await deps.lifecyclePort.getAppointment(appointmentId, organizationId);
      if (!appt) return { ok: false, error: 'not_found' };
      const policy = await deps.policies.resolveBookingPolicy(policyContext(appt));
      const eligibility = evaluateBookingActionEligibility({
        action: 'cancellation',
        referenceStartAt: appt.startAt,
        policy,
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

    async previewPatientReschedule(
      appointmentId: string,
      organizationId: string,
    ): Promise<PreviewRescheduleResult> {
      const appt = await deps.lifecyclePort.getAppointment(appointmentId, organizationId);
      if (!appt) return { ok: false, error: 'not_found' };
      const policy = await deps.policies.resolveBookingPolicy(policyContext(appt));
      const eligibility = evaluateBookingActionEligibility({
        action: 'reschedule',
        referenceStartAt: appt.startAt,
        policy,
      });
      return {
        ok: true,
        allowed: eligibility.allowed,
        reasonCode: eligibility.reasonCode,
        requiresStaffConfirmation: eligibility.requiresStaffConfirmation,
        isFree: eligibility.isFree,
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
      const appt = await deps.lifecyclePort.getAppointment(
        input.appointmentId,
        input.organizationId,
      );
      if (!appt) return { ok: false as const, error: 'not_found' as const };
      if (appt.platformUserId !== input.userId)
        return { ok: false as const, error: 'not_found' as const };

      const policy = await deps.policies.resolveBookingPolicy(policyContext(appt));
      const eligibility = evaluateBookingActionEligibility({
        action: 'reschedule',
        referenceStartAt: appt.startAt,
        policy,
      });
      if (!eligibility.allowed) {
        return { ok: false as const, error: eligibility.reasonCode };
      }
      if (eligibility.requiresStaffConfirmation) {
        return { ok: false as const, error: 'staff_confirmation_required' };
      }

      const now = new Date();
      const freeCancellationAvailableAtReschedule = evaluateBookingActionEligibility({
        action: 'cancellation',
        referenceStartAt: appt.startAt,
        policy,
        now,
      }).isFree;
      const freeCancellationAvailableAfter = evaluateBookingActionEligibility({
        action: 'cancellation',
        referenceStartAt: input.newStartAt,
        policy,
        now,
      }).isFree;

      const updated = await deps.lifecyclePort.applyReschedule({
        appointmentId: input.appointmentId,
        organizationId: input.organizationId,
        newStartAt: input.newStartAt,
        newEndAt: input.newEndAt,
        durationMinutes: input.durationMinutes,
        actorType: 'patient',
        actorId: input.userId,
        reason: input.reason,
        manualOverride: false,
        branchId: input.branchId ?? appt.branchId,
        roomId: appt.roomId,
        specialistId: input.specialistId ?? appt.specialistId,
        serviceId: input.serviceId ?? appt.serviceId,
        cityCode: input.cityCode,
        policy: reschedulePolicySnapshot(policy),
        cancellationPolicy: cancellationPolicySnapshot(policy),
        wasInFreeRescheduleWindow: eligibility.isFree,
        freeCancellationAvailableAtReschedule,
        freeCancellationAvailableAfter,
        notificationsSent: input.notificationsSent ?? {
          policy: {
            notifyPatient: policy.notifyPatient,
            notifyStaff: policy.notifyStaff,
          },
        },
      });

      return { ok: true as const, appointment: updated, eligibility, bookingPolicy: policy };
    },

    async patientCancel(input: {
      appointmentId: string;
      organizationId: string;
      userId: string;
      reason?: string;
      notificationsSent?: Record<string, unknown>;
    }) {
      const appt = await deps.lifecyclePort.getAppointment(
        input.appointmentId,
        input.organizationId,
      );
      if (!appt) return { ok: false as const, error: 'not_found' as const };
      if (appt.platformUserId !== input.userId)
        return { ok: false as const, error: 'not_found' as const };

      const policy = await deps.policies.resolveBookingPolicy(policyContext(appt));
      const eligibility = evaluateBookingActionEligibility({
        action: 'cancellation',
        referenceStartAt: appt.startAt,
        policy,
      });

      if (!eligibility.allowed) return { ok: false as const, error: 'not_allowed' as const };
      if (eligibility.requiresStaffConfirmation) {
        return { ok: false as const, error: 'staff_confirmation_required' as const };
      }

      const targetStatus: BeAppointment['status'] = eligibility.isFree
        ? 'cancelled_by_patient'
        : 'late_cancellation';

      const updated = await deps.lifecyclePort.applyCancellation({
        appointmentId: input.appointmentId,
        organizationId: input.organizationId,
        actorType: 'patient',
        actorId: input.userId,
        reason: input.reason,
        policy: cancellationPolicySnapshot(policy),
        wasFree: eligibility.isFree,
        wasPenalized: !eligibility.isFree,
        decisionType: eligibility.decisionType,
        targetStatus,
        packageSessionCharged:
          !eligibility.isFree && eligibility.decisionType === 'package_charged',
        prepaymentRetained:
          !eligibility.isFree && policy.lateChangeBehavior === 'retain_prepayment',
        prepaymentRefunded:
          !eligibility.isFree && policy.lateChangeBehavior === 'refund_prepayment',
        notificationsSent: input.notificationsSent ?? {
          policy: {
            notifyPatient: policy.notifyPatient,
            notifyStaff: policy.notifyStaff,
          },
        },
      });

      return { ok: true as const, appointment: updated, eligibility, bookingPolicy: policy };
    },

    async staffCancel(input: {
      appointmentId: string;
      organizationId: string;
      actorType: 'specialist' | 'admin';
      actorId: string;
      decisionType: import('@/modules/booking-policies/types').CancellationDecisionType;
      reason?: string;
      staffComment?: string;
      manualOverride?: boolean;
      notificationsSent?: Record<string, unknown>;
    }) {
      const appt = await deps.lifecyclePort.getAppointment(
        input.appointmentId,
        input.organizationId,
      );
      if (!appt) return { ok: false as const, error: 'not_found' as const };

      const policy = await deps.policies.resolveBookingPolicy(policyContext(appt));
      const wasFree = input.decisionType === 'free';
      const targetStatus: BeAppointment['status'] = wasFree
        ? 'cancelled_by_specialist'
        : input.decisionType === 'penalized'
          ? 'late_cancellation'
          : 'cancelled_by_specialist';

      const updated = await deps.lifecyclePort.applyCancellation({
        appointmentId: input.appointmentId,
        organizationId: input.organizationId,
        actorType: input.actorType,
        actorId: input.actorId,
        reason: input.reason,
        staffComment: input.staffComment,
        manualOverride: input.manualOverride ?? true,
        decisionType: input.decisionType,
        policy: cancellationPolicySnapshot(policy),
        wasFree,
        wasPenalized: input.decisionType === 'penalized',
        targetStatus,
        packageSessionCharged: input.decisionType === 'package_charged',
        prepaymentRetained: input.decisionType === 'retain_prepayment',
        prepaymentRefunded: input.decisionType === 'refund_prepayment',
        notificationsSent: input.notificationsSent,
      });

      return {
        ok: true as const,
        appointment: updated,
        bookingPolicy: policy,
        cancelPolicy: cancellationPolicySnapshot(policy),
      };
    },

    async staffReschedule(input: {
      appointmentId: string;
      organizationId: string;
      actorType: 'specialist' | 'admin';
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
      deliveryFormat?: AppointmentDeliveryFormat;
      /** APPT-FORM-13: смена пациента записи в пределах той же клиники. */
      platformUserId?: string | null;
      notificationsSent?: Record<string, unknown>;
    }) {
      const appt = await deps.lifecyclePort.getAppointment(
        input.appointmentId,
        input.organizationId,
      );
      if (!appt) return { ok: false as const, error: 'not_found' as const };

      const policy = await deps.policies.resolveBookingPolicy(policyContext(appt));
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
        deliveryFormat: input.deliveryFormat ?? appt.deliveryFormat,
        platformUserId: input.platformUserId,
        policy: reschedulePolicySnapshot(policy),
        cancellationPolicy: cancellationPolicySnapshot(policy),
        wasInFreeRescheduleWindow: input.manualOverride ?? true,
        freeCancellationAvailableAtReschedule: evaluateBookingActionEligibility({
          action: 'cancellation',
          referenceStartAt: appt.startAt,
          policy,
          now,
        }).isFree,
        freeCancellationAvailableAfter: evaluateBookingActionEligibility({
          action: 'cancellation',
          referenceStartAt: input.newStartAt,
          policy,
          now,
        }).isFree,
        notificationsSent: input.notificationsSent,
      });

      return {
        ok: true as const,
        appointment: updated,
        bookingPolicy: policy,
        reschedulePolicy: reschedulePolicySnapshot(policy),
      };
    },

    patchLatestRescheduleNotifications: deps.lifecyclePort.patchLatestRescheduleNotifications.bind(
      deps.lifecyclePort,
    ),
    patchLatestCancellationNotifications:
      deps.lifecyclePort.patchLatestCancellationNotifications.bind(deps.lifecyclePort),
    patchLatestNoShowNotifications: deps.lifecyclePort.patchLatestNoShowNotifications.bind(
      deps.lifecyclePort,
    ),

    listReschedules: deps.lifecyclePort.listReschedules.bind(deps.lifecyclePort),
    listCancellations: deps.lifecyclePort.listCancellations.bind(deps.lifecyclePort),
    listNoShows: deps.lifecyclePort.listNoShows.bind(deps.lifecyclePort),

    async staffMarkNoShow(input: {
      appointmentId: string;
      organizationId: string;
      actorType: 'specialist' | 'admin';
      actorId: string;
      reason?: string;
      staffComment?: string;
      notificationsSent?: Record<string, unknown>;
    }): Promise<
      | { ok: true; appointment: BeAppointment; noShowRecord: AppointmentNoShowRecord }
      | { ok: false; error: 'not_found' | 'state_conflict' }
    > {
      const appt = await deps.lifecyclePort.getAppointment(
        input.appointmentId,
        input.organizationId,
      );
      if (!appt) return { ok: false, error: 'not_found' };
      // Terminal check: surface early error if already no_show (no double-count).
      if (appt.status === 'no_show') return { ok: false, error: 'state_conflict' };

      const updated = await deps.lifecyclePort.applyNoShow({
        appointmentId: input.appointmentId,
        organizationId: input.organizationId,
        actorType: input.actorType,
        actorId: input.actorId,
        reason: input.reason,
        staffComment: input.staffComment,
        manualOverride: true,
        notificationsSent: input.notificationsSent,
      });

      // Read back the no-show history record (the latest one written in the same transaction)
      const noShows = await deps.lifecyclePort.listNoShows(
        input.appointmentId,
        input.organizationId,
      );
      const noShowRecord = noShows[noShows.length - 1]!;
      return { ok: true, appointment: updated, noShowRecord };
    },
  };
}

function cancelMessageKey(reasonCode: string, isFree: boolean): string {
  if (!isFree && reasonCode === 'late') return 'cancel_late_penalty';
  if (reasonCode === 'not_allowed') return 'cancel_not_allowed';
  return 'cancel_free';
}

function rescheduleMessageKey(reasonCode: string): string {
  if (reasonCode === 'late') return 'reschedule_late_penalty';
  if (reasonCode === 'not_allowed') return 'reschedule_not_allowed';
  return 'reschedule_allowed';
}
