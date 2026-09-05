import type { NextResponse } from 'next/server';
import { jsonError, type ApiErrorLiteralRules } from '@/shared/http/apiResponse';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';

export function resolveAssignedByPlatformUserId(userId: string): string | null {
  return isPlatformUserUuid(userId) ? userId : null;
}

export function manualPatientPackageCreatesOnlinePayment(input: {
  priceMinor: number;
  sendForPayment?: boolean;
  soldAt?: string | null;
  paidAmountMinor?: number | null;
  activateImmediately?: boolean;
}): boolean {
  const staffSold =
    input.activateImmediately === true ||
    (input.soldAt != null && input.paidAmountMinor != null && input.sendForPayment === false);
  return input.priceMinor > 0 && input.sendForPayment !== false && !staffSold;
}

export function catalogPatientPackageCreatesOnlinePayment(input: {
  priceMinor: number;
  soldAt?: string | null;
  paidAmountMinor?: number | null;
  activateImmediately?: boolean;
}): boolean {
  const staffSold =
    input.activateImmediately === true || (input.soldAt != null && input.paidAmountMinor != null);
  return input.priceMinor > 0 && !staffSold;
}

/**
 * The closed allowlist of membership codes this family is allowed to name to a browser. Anything
 * else is an internal failure: before S4 its raw `.message` became the response body, which is how
 * a rejected `insert into "be_patient_package_items" …` reached the doctor's screen with SQL text,
 * the table name and bound parameters.
 */
const MEMBERSHIP_ERROR_RULES: ApiErrorLiteralRules = {
  catalog_not_found: { code: 'catalog_not_found', status: 404 },
  sale_link_requires_price: { code: 'sale_link_requires_price', status: 400 },
  sale_cash_requires_price: { code: 'sale_cash_requires_price', status: 400 },
  sale_free_requires_zero_price: { code: 'sale_free_requires_zero_price', status: 400 },
  sale_attempt_key_conflict: { code: 'sale_attempt_key_conflict', status: 409 },
  package_not_found: { code: 'package_not_found', status: 404 },
  appointment_not_found: { code: 'appointment_not_found', status: 404 },
  platform_user_id_required: { code: 'platform_user_id_required', status: 400 },
  invalid_body: { code: 'invalid_body', status: 400 },
  past_detach_confirmation_required: { code: 'past_detach_confirmation_required', status: 400 },
  appointment_not_linked_to_package: { code: 'appointment_not_linked_to_package', status: 400 },
  appointment_has_consumed_package_session: {
    code: 'appointment_has_consumed_package_session',
    status: 400,
  },
  past_unlink_not_allowed: { code: 'past_unlink_not_allowed', status: 403 },
  late_detach_choice_required: { code: 'late_detach_choice_required', status: 409 },
  payments_disabled: { code: 'payments_disabled', status: 422 },
  payment_provider_unavailable: { code: 'payment_provider_unavailable', status: 422 },
  payments_unavailable: { code: 'payments_unavailable', status: 503 },
  memberships_unavailable: { code: 'memberships_unavailable', status: 503 },
};

const MEMBERSHIP_FALLBACK = { code: 'membership_operation_failed', status: 500 } as const;

export function membershipErrorResponse(err: unknown): NextResponse {
  return jsonError({
    error: err,
    literalRules: MEMBERSHIP_ERROR_RULES,
    fallback: MEMBERSHIP_FALLBACK,
    logEvent: 'patient_package_operation_failed',
  });
}
