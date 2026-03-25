/**
 * POST /api/doctor/appointments/rubitime/cancel — прокси на integrator api2/remove-record (M2M).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { postIntegratorSignedJson } from "@/infra/integrations/integratorSignedPost";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const bodySchema = z.object({
  recordId: z.union([z.string().min(1), z.number()]),
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const recordId =
    typeof parsed.data.recordId === "number"
      ? String(Math.trunc(parsed.data.recordId))
      : parsed.data.recordId.trim();

  const result = await postIntegratorSignedJson("/api/bersoncare/rubitime/remove-record", {
    recordId,
  });

  if (result.status === 0) {
    return NextResponse.json({ ok: false, error: "integrator_not_configured" }, { status: 503 });
  }

  return NextResponse.json(result.json, { status: result.ok ? 200 : result.status });
}
