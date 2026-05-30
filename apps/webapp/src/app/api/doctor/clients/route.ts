/**
 * POST /api/doctor/clients — создать пациента (телефон обязателен; email → ссылка на вход).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { createDoctorClient } from "@/app-layer/doctor/createDoctorClient";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const createBodySchema = z.object({
  displayName: z.string().max(500).optional(),
  phone: z.string().min(1).max(40),
  email: z.union([z.string().email().max(320), z.literal(""), z.null()]).optional(),
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const parsed = createBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const result = await createDoctorClient(
    {
      displayName: parsed.data.displayName,
      phone: parsed.data.phone,
      email: parsed.data.email ?? null,
      createdByUserId: session.user.userId,
    },
    deps.emailSetupAccess,
  );

  if (!result.ok) {
    const status =
      result.error === "email_conflict" ? 409
      : result.error === "invalid_phone" || result.error === "invalid_email" ? 400
      : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    client: {
      id: result.userId,
      displayName: result.displayName,
      phone: result.phoneNormalized,
    },
    created: result.created,
    emailSetupEnqueued: result.emailSetupEnqueued,
  });
}
