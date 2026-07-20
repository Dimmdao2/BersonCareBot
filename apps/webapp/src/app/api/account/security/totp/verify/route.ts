import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { setSessionFromUser } from "@/modules/auth/service";

const bodySchema = z.object({ code: z.string().regex(/^\d{6}$/u) });

export async function POST(request: Request) {
  const gate = await requireDoctorApiSession();
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  const deps = buildAppDeps();
  const result = await deps.staffSecurity.verifyTotpEnrollment({
    userId: gate.session.user.userId,
    code: parsed.data.code,
  });
  if (!result.ok) return NextResponse.json(result, { status: result.error === "factor_locked" ? 429 : 400 });
  const user = await deps.userByPhone.findByUserId(gate.session.user.userId);
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await setSessionFromUser(user, {
    staffSecurity: { assurance: "factor_verified", verifiedAt: Math.floor(Date.now() / 1000) },
  });
  return NextResponse.json({ ok: true, recoveryCodes: result.recoveryCodes });
}
