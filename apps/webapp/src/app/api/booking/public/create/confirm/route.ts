/**
 * A-3 — step 2: the code proves control of the contact, and only now does the booking exist.
 *
 * The body carries `challengeId` + `code` and nothing else. Every fact about the booking — clinic,
 * branch, service, slot, contact — comes from the intent pinned at step 1, so a caller cannot
 * verify a code against a cheap booking and then redeem it against a different one.
 *
 * Everything the create step used to leak happens here instead: resolving the person, the
 * blocked-client check, package selection, paid-versus-unpaid status. Behind proof of ownership
 * those are the caller's own facts, not an oracle.
 */
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { z } from 'zod';
import { createVerifiedPublicBooking } from '@/app-layer/booking/createVerifiedPublicBooking';
import {
  isPublicBookingConfirmRateLimited,
  PUBLIC_BOOKING_CONFIRM_RATE_LIMIT_SEC,
  resolvePublicBookingRateLimitClientKey,
} from '@/modules/public-booking/publicBookingRateLimit';
import { consumePublicBookingVerification } from '@/modules/public-booking/publicBookingVerification';
import { redactPublicBookingRecord } from '@/modules/public-booking/publicBookingResponse';
import { InPersonBookingResolveError } from '@/modules/patient-booking/inPersonBookingResolve';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  jsonError,
  jsonOk,
  mapApiError,
  type ApiErrorLiteralRules,
} from '@/shared/http/apiResponse';

const bodySchema = z.object({
  challengeId: z.string().min(1).max(200),
  code: z.string().min(1).max(16),
});

const CONFIRM_RESOLVE_ERROR_RULES = {
  ambiguous_booking_tenant: { status: 400, code: 'ambiguous_booking_tenant' },
  booking_scheduling_unavailable: { status: 400, code: 'booking_scheduling_unavailable' },
  branch_not_found: { status: 400, code: 'branch_not_found' },
  branch_service_mapping_missing: { status: 404, code: 'branch_service_mapping_missing' },
  branch_service_not_found: { status: 400, code: 'branch_service_not_found' },
  invalid_in_person_keys: { status: 400, code: 'invalid_in_person_keys' },
} as const satisfies ApiErrorLiteralRules;

const CONFIRM_CREATE_ERROR_RULES = {
  booking_blocked: { status: 403, code: 'booking_blocked' },
  branch_service_not_found: { status: 404, code: 'branch_service_not_found' },
  canonical_booking_unavailable: { status: 503, code: 'canonical_booking_unavailable' },
  catalog_unavailable: { status: 503, code: 'catalog_unavailable' },
  consecutive_slot_cap_exceeded: { status: 400, code: 'consecutive_slot_cap_exceeded' },
  invalid_email: { status: 400, code: 'invalid_email' },
  invalid_phone: { status: 400, code: 'invalid_phone' },
  invalid_slot_count: { status: 400, code: 'invalid_slot_count' },
  payment_provider_unavailable: { status: 422, code: 'payment_provider_unavailable' },
  payments_disabled: { status: 422, code: 'payments_disabled' },
  required_field_missing: { status: 400, code: 'required_field_missing' },
  slot_overlap: { status: 409, code: 'slot_overlap' },
} as const satisfies ApiErrorLiteralRules;

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/booking/public/create/confirm:POST', request);
  ensureAuthModulePortsBound();

  const rateKey = resolvePublicBookingRateLimitClientKey(request);
  if (!rateKey.ok) {
    return jsonError(
      'proxy_configuration',
      { message: 'Запрос должен проходить через reverse proxy с заголовком X-Real-IP.' },
      { status: 503 },
    );
  }
  if (await isPublicBookingConfirmRateLimited(rateKey.key)) {
    return jsonError(
      'rate_limited',
      { retryAfterSeconds: PUBLIC_BOOKING_CONFIRM_RATE_LIMIT_SEC },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError('invalid_body', {}, { status: 400 });
  }

  const deps = buildAppDeps();
  const consumed = await consumePublicBookingVerification(
    deps.publicBookingVerification,
    parsed.data.challengeId,
    parsed.data.code,
  );
  if (!consumed.ok) {
    // One code, one status, for wrong / expired / unknown / exhausted alike (ASVS 6.3.8, CWE-204).
    return jsonError(
      'verification_failed',
      consumed.retryAfterSeconds ? { retryAfterSeconds: consumed.retryAfterSeconds } : {},
      { status: 400 },
    );
  }

  try {
    const booking = await withExplicitOrganizationPrincipal(
      {
        organizationId: consumed.verified.intent.organizationId,
        source: 'api/booking/public/create/confirm:POST',
      },
      () =>
        createVerifiedPublicBooking(
          deps,
          consumed.verified.intent,
          // An e-mail-delivered code proves the e-mail, never the phone (#1005). The decision lives in
          // `channelProvesPhoneControl`; this call site only carries its answer.
          consumed.verified.phoneProven,
        ),
    );
    let checkoutUrl: string | null = null;
    if (booking.status === 'awaiting_payment') {
      const paymentStatus = await deps.patientBooking.getBookingPaymentStatusForContact(
        booking.id,
        consumed.verified.intent.contactPhone,
      );
      checkoutUrl = paymentStatus.ok ? (paymentStatus.summary?.intent?.checkoutUrl ?? null) : null;
    }
    return jsonOk({ booking: redactPublicBookingRecord(booking), checkoutUrl }, { status: 200 });
  } catch (error) {
    const mapped = mapApiError(
      error,
      CONFIRM_CREATE_ERROR_RULES,
      { status: 503, code: 'create_failed' },
      [
        {
          matches: (candidate: unknown): candidate is InPersonBookingResolveError =>
            candidate instanceof InPersonBookingResolveError,
          literalRules: CONFIRM_RESOLVE_ERROR_RULES,
        },
      ],
    );
    return jsonError(mapped.code, mapped.publicFields ?? {}, {
      status: mapped.status,
      headers: mapped.headers,
    });
  }
}
