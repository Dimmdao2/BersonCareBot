/**
 * POST /api/doctor/clients/:userId/block — блокировка исходящих сообщений подписчика в чате поддержки.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const bodySchema = z.object({
  blocked: z.boolean(),
  reason: z.string().max(2000).optional().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentity(userId);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  await deps.doctorClientsPort.setClientBlocked({
    userId,
    blocked: parsed.data.blocked,
    reason: parsed.data.reason ?? null,
    actorId: session.user.userId,
  });

  return NextResponse.json({ ok: true });
}
