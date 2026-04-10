import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().max(400).optional(),
});

export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const result = await deps.patientBooking.cancelBooking({
    userId: session.user.userId,
    bookingId: parsed.data.bookingId,
    reason: parsed.data.reason,
  });
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (result.error === "already_cancelled") {
      return NextResponse.json({ ok: false, error: "already_cancelled" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "sync_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
