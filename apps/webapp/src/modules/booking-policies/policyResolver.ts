import type {
  BookingActionEligibility,
  BookingPolicy,
  CancellationDecisionType,
} from './types';

export function hoursUntil(isoStart: string, now: Date): number {
  return (new Date(isoStart).getTime() - now.getTime()) / 3_600_000;
}

export function evaluateBookingActionEligibility(input: {
  action: 'cancellation' | 'reschedule';
  referenceStartAt: string;
  policy: BookingPolicy;
  now?: Date;
  manualOverride?: { allowed: boolean; decisionType: CancellationDecisionType };
}): BookingActionEligibility {
  const now = input.now ?? new Date();
  const hours = hoursUntil(input.referenceStartAt, now);

  if (input.manualOverride) {
    return {
      action: input.action,
      allowed: input.manualOverride.allowed,
      isFree: input.manualOverride.decisionType === 'free',
      requiresStaffConfirmation: false,
      decisionType: input.manualOverride.decisionType,
      reasonCode: 'manual_override',
      referenceStartAt: input.referenceStartAt,
      hoursUntilReference: hours,
    };
  }

  const actionAllowed =
    input.action === 'cancellation'
      ? input.policy.cancellationAllowed
      : input.policy.rescheduleAllowed;
  if (!actionAllowed) {
    return {
      action: input.action,
      allowed: false,
      isFree: false,
      requiresStaffConfirmation: false,
      decisionType: 'penalized',
      reasonCode: 'not_allowed',
      referenceStartAt: input.referenceStartAt,
      hoursUntilReference: hours,
    };
  }

  if (hours >= input.policy.freeChangeHoursBefore) {
    return {
      action: input.action,
      allowed: true,
      isFree: true,
      requiresStaffConfirmation: false,
      decisionType: 'free',
      reasonCode: 'free',
      referenceStartAt: input.referenceStartAt,
      hoursUntilReference: hours,
    };
  }

  return {
    action: input.action,
    allowed: true,
    isFree: false,
    requiresStaffConfirmation:
      input.policy.requiresStaffConfirmation || input.policy.lateChangeBehavior === 'manual_review',
    decisionType: resolveLateBookingDecisionType(input.policy),
    reasonCode: 'late',
    referenceStartAt: input.referenceStartAt,
    hoursUntilReference: hours,
  };
}

function resolveLateBookingDecisionType(
  policy: Pick<BookingPolicy, 'lateChangeBehavior' | 'chargePackageSessionOnLate'>,
): CancellationDecisionType {
  if (policy.chargePackageSessionOnLate || policy.lateChangeBehavior === 'charge_package') {
    return 'package_charged';
  }
  if (policy.lateChangeBehavior === 'retain_prepayment') return 'retain_prepayment';
  if (policy.lateChangeBehavior === 'refund_prepayment') return 'refund_prepayment';
  return 'penalized';
}
