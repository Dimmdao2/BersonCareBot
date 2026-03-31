import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";

const bodySchema = z.object({
  type: z.enum(["in_person", "online"]),
  city: z.string().trim().optional(),
  category: z.enum(["rehab_lfk", "nutrition", "general"]),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.string().email().optional(),
});

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
  try {
    const booking = await deps.patientBooking.createBooking({
      userId: session.user.userId,
      type: parsed.data.type,
      city: parsed.data.city,
      category: parsed.data.category,
      slotStart: parsed.data.slotStart,
      slotEnd: parsed.data.slotEnd,
      contactName: parsed.data.contactName,
      contactPhone: parsed.data.contactPhone,
      contactEmail: parsed.data.contactEmail,
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
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
