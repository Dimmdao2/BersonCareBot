import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";

const onlineQuery = z.object({
  type: z.literal("online"),
  category: z.enum(["rehab_lfk", "nutrition", "general"]),
  city: z.string().trim().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const inPersonQuery = z.object({
  type: z.literal("in_person"),
  branchServiceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const querySchema = z.discriminatedUnion("type", [onlineQuery, inPersonQuery]);

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
    category: url.searchParams.get("category") ?? undefined,
    city: url.searchParams.get("city") ?? undefined,
    branchServiceId: url.searchParams.get("branchServiceId") ?? undefined,
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
    const msg = err instanceof Error ? err.message : "slots_unavailable";
    if (msg === "branch_service_not_found") {
      return NextResponse.json({ ok: false, error: "branch_service_not_found" }, { status: 404 });
    }
    if (msg === "catalog_unavailable") {
      return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
    }
    console.error("[booking/slots] getSlots failed:", err);
    return NextResponse.json({ ok: false, error: "slots_unavailable" }, { status: 503 });
  }
}
