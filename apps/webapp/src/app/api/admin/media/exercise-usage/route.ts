import { NextResponse } from "next/server";
import { z } from "zod";
import { webappReposAreInMemory } from "@/config/env";
import { pgListExerciseUsageForMediaIds } from "@/infra/repos/pgLfkExercises";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).max(200),
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  if (webappReposAreInMemory() || parsed.data.ids.length === 0) {
    return NextResponse.json({ ok: true, usage: {} as Record<string, unknown> });
  }

  const usage = await pgListExerciseUsageForMediaIds(parsed.data.ids);
  return NextResponse.json({ ok: true, usage });
}
