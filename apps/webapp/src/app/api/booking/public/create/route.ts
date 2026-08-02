/**
 * A-3 — step 1 of the anonymous booking flow: prove control of the contact, THEN book.
 *
 * Owner ruling: «всегда просить код или вход». This handler no longer creates a booking for an
 * anonymous caller. It validates and tenant-binds the request, pins it server-side, sends a
 * one-time code and returns a challenge. `POST /api/booking/public/create/confirm` finishes the
 * job. An authenticated patient booking under their OWN phone skips the code — they proved control
 * of it at login — which is the "или вход" half of the ruling.
 *
 * What this handler deliberately no longer does before proof: resolve or create a person from the
 * phone, check whether that person is blocked at this clinic, pick up their paid package, or return
 * their identifier. Those were the three oracles and the harm.
 */
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { createVerifiedPublicBooking } from '@/app-layer/booking/createVerifiedPublicBooking';
import { identifyPublicBookingPayer } from '@/app-layer/booking/identifyPublicBookingPayer';
import {
  isPublicBookingCreateRateLimited,
  PUBLIC_BOOKING_RATE_LIMIT_SEC,
  resolvePublicBookingRateLimitClientKey,
} from '@/modules/public-booking/publicBookingRateLimit';
import { issuePublicBookingVerification } from '@/modules/public-booking/publicBookingVerification';
import {
  PUBLIC_BOOKING_INTENT_VERSION,
  type PublicBookingIntent,
} from '@/modules/public-booking/publicBookingIntent';
import { redactPublicBookingRecord } from '@/modules/public-booking/publicBookingResponse';
import { publicBookingCreateBodySchema } from '../bookingPublicBodySchema';
import {
  InPersonBookingResolveError,
  resolveInPersonBookingContext,
  resolveSlugBoundPublicInPersonBookingOrganization,
} from '@/modules/patient-booking/inPersonBookingResolve';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { logger } from '@/app-layer/logging/logger';
import {
  jsonError,
  jsonOk,
  mapApiError,
  type ApiErrorLiteralRules,
} from '@/shared/http/apiResponse';

const PUBLIC_IN_PERSON_RESOLVE_ERROR_RULES = {
  ambiguous_booking_tenant: { status: 400, code: 'ambiguous_booking_tenant' },
  booking_scheduling_unavailable: { status: 400, code: 'booking_scheduling_unavailable' },
  branch_not_found: { status: 400, code: 'branch_not_found' },
  branch_service_mapping_missing: { status: 404, code: 'branch_service_mapping_missing' },
  branch_service_not_found: { status: 400, code: 'branch_service_not_found' },
  invalid_in_person_keys: { status: 400, code: 'invalid_in_person_keys' },
} as const satisfies ApiErrorLiteralRules;

/**
 * Errors reachable on THIS step. Note what is absent: `booking_blocked`. Whether a phone belongs to
 * a client this clinic has blocked is decided at confirm, behind proof of ownership — a 403 that
 * only a blocked client's phone could produce was oracle #3.
 */
const PUBLIC_BOOKING_CREATE_ERROR_RULES = {
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
  stampBootstrapPrincipal('api/booking/public/create:POST', request);
  ensureAuthModulePortsBound();

  const rateKey = resolvePublicBookingRateLimitClientKey(request);
  if (!rateKey.ok) {
    return jsonError(
      'proxy_configuration',
      { message: 'Запрос должен проходить через reverse proxy с заголовком X-Real-IP.' },
      { status: 503 },
    );
  }
  if (await isPublicBookingCreateRateLimited(rateKey.key)) {
    return jsonError(
      'rate_limited',
      { retryAfterSeconds: PUBLIC_BOOKING_RATE_LIMIT_SEC },
      { status: 429 },
    );
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = publicBookingCreateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('invalid_body', {}, { status: 400 });
  }

  const body = parsed.data;
  const deps = buildAppDeps();

  try {
    if (body.type === 'online') {
      return jsonError('ambiguous_booking_tenant', {}, { status: 400 });
    }

    // Tenant binding, unchanged and still ahead of everything else: slug → organisation,
    // branch+service → organisation, resolved context → organisation, all three must agree.
    const publicContext = await resolveSlugBoundPublicInPersonBookingOrganization(deps, body);
    const ctx = await withExplicitOrganizationPrincipal(
      { organizationId: publicContext.organizationId, source: 'api/booking/public/create:POST' },
      async () => {
        const resolved = await resolveInPersonBookingContext(deps, publicContext.keys);
        if (resolved.organizationId !== publicContext.organizationId) {
          throw new InPersonBookingResolveError('ambiguous_booking_tenant');
        }
        return resolved;
      },
    );

    const intent: PublicBookingIntent = {
      v: PUBLIC_BOOKING_INTENT_VERSION,
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      serviceId: ctx.serviceId,
      slotStart: body.slotStart,
      slotEnd: body.slotEnd,
      slotCount: body.slotCount,
      contactName: body.contactName,
      contactPhone: body.contactPhone,
      contactEmail: body.contactEmail,
      formAnswers: body.formAnswers,
      attribution: body.attribution,
    };

    const payer = await identifyPublicBookingPayer(
      deps,
      body.proofMethod === 'email'
        ? { kind: 'verified_email_session', submittedEmail: body.contactEmail }
        : { kind: 'session' },
    );
    if (payer.ok) {
      try {
        const booking = await withExplicitOrganizationPrincipal(
          { organizationId: ctx.organizationId, source: 'api/booking/public/create:POST' },
          () => createVerifiedPublicBooking(deps, intent, payer.platformUserId),
        );
        let checkoutUrl: string | null = null;
        if (booking.status === 'awaiting_payment') {
          const paymentStatus = await deps.patientBooking.getBookingPaymentStatus(
            booking.id,
            payer.platformUserId,
          );
          checkoutUrl = paymentStatus.ok
            ? (paymentStatus.summary?.intent?.checkoutUrl ?? null)
            : null;
        }
        return jsonOk(
          { booking: redactPublicBookingRecord(booking), checkoutUrl },
          { status: 200 },
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'booking_blocked') {
          return jsonError('booking_blocked', {}, { status: 403 });
        }
        throw error;
      }
    }

    if (body.proofMethod === 'email') {
      return jsonError('identity_not_verified', {}, { status: 403 });
    }

    const issued = await issuePublicBookingVerification(deps.publicBookingVerification, intent);
    if (!issued.ok) {
      if (issued.code === 'invalid_phone') {
        return jsonError('invalid_phone', {}, { status: 400 });
      }
      // No `retryAfterSeconds` here. The per-phone resend cooldown is keyed on the NUMBER, so
      // echoing a countdown would tell a caller that somebody recently requested a code for that
      // number — a weaker oracle than account existence, but the same class, and observed live on
      // DEV before it was removed.
      return jsonError('verification_unavailable', {}, { status: 503 });
    }

    return jsonOk(
      {
        verification: {
          challengeId: issued.challengeId,
          expiresInSeconds: issued.expiresInSeconds,
          ...(issued.retryAfterSeconds ? { retryAfterSeconds: issued.retryAfterSeconds } : {}),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof InPersonBookingResolveError) {
      // Reason stays server-side: distinct wire errors would let anonymous callers enumerate clinics/services.
      logger.warn(
        {
          reason: error.reason,
          // `body` is a discriminated union: only the in_person variant carries these keys.
          ...(body.type === 'in_person'
            ? { branchId: body.branchId, serviceId: body.serviceId, orgSlug: body.orgSlug }
            : {}),
        },
        '[booking/public/create] in-person booking resolution refused',
      );
    }
    const mapped = mapApiError(
      error,
      PUBLIC_BOOKING_CREATE_ERROR_RULES,
      { status: 503, code: 'create_failed' },
      [
        {
          matches: (candidate: unknown): candidate is InPersonBookingResolveError =>
            candidate instanceof InPersonBookingResolveError,
          literalRules: PUBLIC_IN_PERSON_RESOLVE_ERROR_RULES,
        },
      ],
    );
    return jsonError(mapped.code, mapped.publicFields ?? {}, {
      status: mapped.status,
      headers: mapped.headers,
    });
  }
}
