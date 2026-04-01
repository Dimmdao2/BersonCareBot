import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";

const querySchema = z.object({
  type: z.enum(["in_person", "online"]),
  city: z.string().trim().optional(),
  category: z.enum(["rehab_lfk", "nutrition", "general"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    type: url.searchParams.get("type") ?? undefined,
    city: url.searchParams.get("city") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    date: url.searchParams.get("date") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const slots = await deps.patientBooking.getSlots(parsed.data);
    return NextResponse.json({ ok: true, slots }, { status: 200 });
  } catch (err) {
    console.error("[booking/slots] getSlots failed:", err);
    return NextResponse.json({ ok: false, error: "slots_unavailable" }, { status: 503 });
  }
}
