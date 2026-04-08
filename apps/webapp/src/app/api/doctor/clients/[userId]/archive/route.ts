/**
 * PATCH /api/doctor/clients/:userId/archive — архив / снятие архива (врач или админ).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyClientArchiveChange,
  clientArchiveBodySchema,
} from "@/modules/doctor-clients/clientArchiveChange";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
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
  const parsed = clientArchiveBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  return applyClientArchiveChange(userId, parsed.data.archived);
}
