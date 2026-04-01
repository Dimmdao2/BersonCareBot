import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";

const onlineBody = z.object({
  type: z.literal("online"),
  category: z.enum(["rehab_lfk", "nutrition", "general"]),
  city: z.string().trim().optional(),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.string().email().optional(),
});

const inPersonBody = z.object({
  type: z.literal("in_person"),
  branchServiceId: z.string().uuid(),
  cityCode: z.string().trim().min(1),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.string().email().optional(),
});

const bodySchema = z.discriminatedUnion("type", [onlineBody, inPersonBody]);

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const body = parsed.data;
  try {
    const booking =
      body.type === "online"
        ? await deps.patientBooking.createBooking({
            userId: session.user.userId,
            type: "online",
            category: body.category,
            slotStart: body.slotStart,
            slotEnd: body.slotEnd,
            contactName: body.contactName,
            contactPhone: body.contactPhone,
            contactEmail: body.contactEmail,
          })
        : await deps.patientBooking.createBooking({
            userId: session.user.userId,
            type: "in_person",
            branchServiceId: body.branchServiceId,
            cityCode: body.cityCode,
            slotStart: body.slotStart,
            slotEnd: body.slotEnd,
            contactName: body.contactName,
            contactPhone: body.contactPhone,
            contactEmail: body.contactEmail,
          });
    return NextResponse.json({ ok: true, booking }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "create_failed";
    if (message === "slot_overlap") {
      return NextResponse.json({ ok: false, error: "slot_overlap" }, { status: 409 });
    }
    if (message === "booking_confirm_failed") {
      return NextResponse.json({ ok: false, error: "booking_confirm_failed" }, { status: 503 });
    }
    if (message === "branch_service_not_found") {
      return NextResponse.json({ ok: false, error: "branch_service_not_found" }, { status: 404 });
    }
    if (message === "catalog_unavailable") {
      return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
    }
    if (message === "slot_already_taken" || message === "duplicate_local_booking_id") {
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }
    if (message === "rubitime_branch_not_found") {
      return NextResponse.json({ ok: false, error: message }, { status: 422 });
    }
    if (message === "city_mismatch") {
      return NextResponse.json({ ok: false, error: "city_mismatch" }, { status: 400 });
    }
    if (
      message === "invalid_branch_service_id" ||
      message === "invalid_city_code" ||
      message === "invalid_slot_range" ||
      message === "invalid_datetime" ||
      message === "invalid_contact_name" ||
      message === "invalid_contact_phone"
    ) {
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
    if (message === "integrator_not_configured" || message.startsWith("rubitime_")) {
      return NextResponse.json({ ok: false, error: message }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
