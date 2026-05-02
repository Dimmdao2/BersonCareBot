import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const usage = await deps.courses.getCourseUsage(id);
    return NextResponse.json({ ok: true, usage });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
