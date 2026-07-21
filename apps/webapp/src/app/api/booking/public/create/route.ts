import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
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
  resolveInPersonCityCode,
  resolveSlugBoundPublicInPersonBookingOrganization,
} from "@/modules/patient-booking/inPersonBookingResolve";

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/booking/public/create:POST", request);
  ensureAuthModulePortsBound();

  const rateKey = resolvePublicBookingRateLimitClientKey(request);
  if (!rateKey.ok) {
    return NextResponse.json(
      { ok: false, error: "proxy_configuration", message: "Запрос должен проходить через reverse proxy с заголовком X-Real-IP." },
      { status: 503 },
    );
  }
  if (await isPublicBookingCreateRateLimited(rateKey.key)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfterSeconds: PUBLIC_BOOKING_RATE_LIMIT_SEC },
      { status: 429 },
    );
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = publicBookingCreateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const body = parsed.data;
  const deps = buildAppDeps();
  const bookingChannel = "public_widget" as const;
  const attribution = body.attribution;

  try {
    if (body.type === "online") {
      return NextResponse.json({ ok: false, error: "ambiguous_booking_tenant" }, { status: 400 });
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
        const cityCode =
          body.cityCode?.trim().toLowerCase() ??
          (await resolveInPersonCityCode(deps, ctx.branchServiceId));
        const booking = await deps.patientBooking.createBooking({
          userId: user.userId,
          organizationId: ctx.organizationId,
          bookingChannel,
          attribution,
          type: "in_person",
          branchServiceId: ctx.branchServiceId,
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

    return NextResponse.json({ ok: true, booking: result.booking, userId: result.userId }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "create_failed";
    if (error instanceof InPersonBookingResolveError) {
      const status = message === "branch_service_mapping_missing" ? 404 : 400;
      return NextResponse.json({ ok: false, error: message }, { status });
    }
    if (message === "slot_overlap") {
      return NextResponse.json({ ok: false, error: "slot_overlap" }, { status: 409 });
    }
    if (message === "consecutive_slot_cap_exceeded" || message === "invalid_slot_count") {
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
    if (message === "required_field_missing" || message === "invalid_email" || message === "invalid_phone") {
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
    if (message === "branch_service_not_found") {
      return NextResponse.json({ ok: false, error: message }, { status: 404 });
    }
    if (message === "canonical_booking_unavailable" || message === "catalog_unavailable") {
      return NextResponse.json({ ok: false, error: message }, { status: 503 });
    }
    if (message === "booking_blocked") {
      return NextResponse.json({ ok: false, error: message }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
