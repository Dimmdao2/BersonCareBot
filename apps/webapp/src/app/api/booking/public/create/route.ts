import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPool } from "@/app-layer/db/client";
import { resolveOrCreateUserByPhone } from "@/app-layer/platform-user/resolveOrCreateUserByPhone";
import { recordPublicBookingMergeCandidates } from "@/app-layer/platform-user/recordPublicBookingMergeCandidates";
import {
  isPublicBookingCreateRateLimited,
  PUBLIC_BOOKING_RATE_LIMIT_SEC,
  resolvePublicBookingRateLimitClientKey,
} from "@/modules/public-booking/publicBookingRateLimit";
import { publicBookingCreateBodySchema } from "../bookingPublicBodySchema";

export async function POST(request: Request) {
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
  const user = await resolveOrCreateUserByPhone(body.contactPhone, body.contactName);
  if (!user.ok) {
    return NextResponse.json({ ok: false, error: user.error }, { status: 400 });
  }

  const deps = buildAppDeps();
  const bookingChannel = "public_widget" as const;
  const attribution = body.attribution;

  try {
    const booking =
      body.type === "online"
        ? await deps.patientBooking.createBooking({
            userId: user.userId,
            bookingChannel,
            attribution,
            type: "online",
            category: body.category,
            slotStart: body.slotStart,
            slotEnd: body.slotEnd,
            contactName: body.contactName,
            contactPhone: body.contactPhone,
            contactEmail: body.contactEmail,
            formAnswers: body.formAnswers,
          })
        : await deps.patientBooking.createBooking({
            userId: user.userId,
            bookingChannel,
            attribution,
            type: "in_person",
            branchServiceId: body.branchServiceId,
            cityCode: body.cityCode,
            slotStart: body.slotStart,
            slotEnd: body.slotEnd,
            contactName: body.contactName,
            contactPhone: body.contactPhone,
            contactEmail: body.contactEmail,
            formAnswers: body.formAnswers,
          });

    if (booking.canonicalAppointmentId && deps.bookingEngine) {
      const orgId = await deps.bookingEngine.organization.getDefaultOrganizationId();
      await recordPublicBookingMergeCandidates({
        pool: getPool(),
        organizationId: orgId,
        anchorUserId: user.userId,
        contactName: body.contactName,
        triggerAppointmentId: booking.canonicalAppointmentId,
      });
    }

    return NextResponse.json({ ok: true, booking, userId: user.userId }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "create_failed";
    if (message === "slot_overlap") {
      return NextResponse.json({ ok: false, error: "slot_overlap" }, { status: 409 });
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
