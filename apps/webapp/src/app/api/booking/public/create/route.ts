import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { ensureAuthModulePortsBound } from "@/app-layer/di/bindAuthModulePorts";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPool } from "@/app-layer/db/client";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { resolveOrCreateUserByPhone } from "@/app-layer/platform-user/resolveOrCreateUserByPhone";
import { recordPublicBookingMergeCandidates } from "@/app-layer/platform-user/recordPublicBookingMergeCandidates";
import {
  isPublicBookingCreateRateLimited,
  PUBLIC_BOOKING_RATE_LIMIT_SEC,
  resolvePublicBookingRateLimitClientKey,
} from "@/modules/public-booking/publicBookingRateLimit";
import { publicBookingCreateBodySchema } from "../bookingPublicBodySchema";
import {
  InPersonBookingResolveError,
  resolveInPersonBookingContext,
  resolveSlugBoundPublicInPersonBookingOrganization,
} from "@/modules/patient-booking/inPersonBookingResolve";
import {
  jsonError,
  jsonOk,
  mapApiError,
  type ApiErrorLiteralRules,
} from "@/shared/http/apiResponse";

const PUBLIC_IN_PERSON_RESOLVE_ERROR_RULES = {
  ambiguous_booking_tenant: { status: 400, code: "ambiguous_booking_tenant" },
  booking_scheduling_unavailable: { status: 400, code: "booking_scheduling_unavailable" },
  branch_not_found: { status: 400, code: "branch_not_found" },
  branch_service_mapping_missing: { status: 404, code: "branch_service_mapping_missing" },
  branch_service_not_found: { status: 400, code: "branch_service_not_found" },
  invalid_in_person_keys: { status: 400, code: "invalid_in_person_keys" },
} as const satisfies ApiErrorLiteralRules;

const PUBLIC_BOOKING_CREATE_ERROR_RULES = {
  booking_blocked: { status: 403, code: "booking_blocked" },
  branch_service_not_found: { status: 404, code: "branch_service_not_found" },
  canonical_booking_unavailable: { status: 503, code: "canonical_booking_unavailable" },
  catalog_unavailable: { status: 503, code: "catalog_unavailable" },
  consecutive_slot_cap_exceeded: { status: 400, code: "consecutive_slot_cap_exceeded" },
  invalid_email: { status: 400, code: "invalid_email" },
  invalid_phone: { status: 400, code: "invalid_phone" },
  invalid_slot_count: { status: 400, code: "invalid_slot_count" },
  required_field_missing: { status: 400, code: "required_field_missing" },
  slot_overlap: { status: 409, code: "slot_overlap" },
} as const satisfies ApiErrorLiteralRules;

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/booking/public/create:POST", request);
  ensureAuthModulePortsBound();

  const rateKey = resolvePublicBookingRateLimitClientKey(request);
  if (!rateKey.ok) {
    return jsonError(
      "proxy_configuration",
      { message: "Запрос должен проходить через reverse proxy с заголовком X-Real-IP." },
      { status: 503 },
    );
  }
  if (await isPublicBookingCreateRateLimited(rateKey.key)) {
    return jsonError(
      "rate_limited",
      { retryAfterSeconds: PUBLIC_BOOKING_RATE_LIMIT_SEC },
      { status: 429 },
    );
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = publicBookingCreateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("invalid_body", {}, { status: 400 });
  }

  const body = parsed.data;
  const deps = buildAppDeps();
  const bookingChannel = "public_widget" as const;
  const attribution = body.attribution;

  try {
    if (body.type === "online") {
      return jsonError("ambiguous_booking_tenant", {}, { status: 400 });
    }

    const publicContext = await resolveSlugBoundPublicInPersonBookingOrganization(deps, body);
    const result = await withExplicitOrganizationPrincipal(
      { organizationId: publicContext.organizationId, source: "api/booking/public/create:POST" },
      async () => {
        const ctx = await resolveInPersonBookingContext(deps, publicContext.keys);
        if (ctx.organizationId !== publicContext.organizationId) {
          throw new InPersonBookingResolveError("ambiguous_booking_tenant");
        }
        const user = await resolveOrCreateUserByPhone(body.contactPhone, body.contactName);
        if (!user.ok) {
          throw new Error(user.error);
        }
        const branch = await deps.bookingEngine?.catalog.getBranch(ctx.branchId);
        const cityCode = branch?.cityCode.trim().toLowerCase();
        if (!cityCode) throw new InPersonBookingResolveError("branch_not_found");
        const booking = await deps.patientBooking.createBooking({
          userId: user.userId,
          organizationId: ctx.organizationId,
          bookingChannel,
          attribution,
          type: "in_person",
          branchId: ctx.branchId,
          serviceId: ctx.serviceId,
          cityCode,
          slotStart: body.slotStart,
          slotEnd: body.slotEnd,
          slotCount: body.slotCount,
          contactName: body.contactName,
          contactPhone: body.contactPhone,
          contactEmail: body.contactEmail,
          formAnswers: body.formAnswers,
        });
        return { booking, userId: user.userId };
      },
    );

    if (result.booking.canonicalAppointmentId && deps.bookingEngine) {
      await recordPublicBookingMergeCandidates({
        pool: getPool(),
        organizationId: publicContext.organizationId,
        anchorUserId: result.userId,
        contactName: body.contactName,
        triggerAppointmentId: result.booking.canonicalAppointmentId,
      });
    }

    return jsonOk({ booking: result.booking, userId: result.userId }, { status: 200 });
  } catch (error) {
    const mapped = mapApiError(
      error,
      PUBLIC_BOOKING_CREATE_ERROR_RULES,
      { status: 503, code: "create_failed" },
      [{
        matches: (candidate: unknown): candidate is InPersonBookingResolveError =>
          candidate instanceof InPersonBookingResolveError,
        literalRules: PUBLIC_IN_PERSON_RESOLVE_ERROR_RULES,
      }],
    );
    return jsonError(mapped.code, mapped.publicFields ?? {}, {
      status: mapped.status,
      headers: mapped.headers,
    });
  }
}
