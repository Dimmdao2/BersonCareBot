import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { resolveOrCreateUserByPhone } from "@/app-layer/platform-user/resolveOrCreateUserByPhone";

const formAnswerSchema = z.object({
  fieldKey: z.string().min(1),
  value: z.string(),
});

const onlineBody = z.object({
  type: z.literal("online"),
  category: z.enum(["rehab_lfk", "nutrition", "general"]),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.string().email().optional(),
  formAnswers: z.array(formAnswerSchema).optional(),
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
  formAnswers: z.array(formAnswerSchema).optional(),
});

const bodySchema = z.discriminatedUnion("type", [onlineBody, inPersonBody]);

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const body = parsed.data;
  const user = await resolveOrCreateUserByPhone(body.contactPhone, body.contactName);
  if (!user.ok) {
    return NextResponse.json({ ok: false, error: user.error }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const booking =
      body.type === "online"
        ? await deps.patientBooking.createBooking({
            userId: user.userId,
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
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
