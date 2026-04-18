import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const postBodySchema = z.object({
  title: z.string().min(1).max(2000),
  description: z.string().max(20000).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id: templateId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const stage = await deps.treatmentProgram.createStage(templateId, {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      sortOrder: parsed.data.sortOrder,
    });
    return NextResponse.json({ ok: true, stage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
