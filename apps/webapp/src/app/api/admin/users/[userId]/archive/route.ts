/**
 * PATCH /api/admin/users/:userId/archive — soft-archive platform user (admin only).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";

const bodySchema = z.object({
  archived: z.boolean(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "admin") {
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

  await deps.doctorClientsPort.setUserArchived(userId, parsed.data.archived);
  return NextResponse.json({ ok: true });
}
