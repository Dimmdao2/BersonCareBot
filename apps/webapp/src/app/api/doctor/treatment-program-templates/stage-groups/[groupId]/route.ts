import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const patchBodySchema = z.object({
  title: z.string().min(1).max(2000).optional(),
  description: z.string().max(10000).optional().nullable(),
  scheduleText: z.string().max(5000).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { groupId } = await ctx.params;
  if (!z.string().uuid().safeParse(groupId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const group = await deps.treatmentProgram.updateTemplateStageGroup(groupId, parsed.data);
    return NextResponse.json({ ok: true, group });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: msg.includes("не найден") ? 404 : 400 });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { groupId } = await ctx.params;
  if (!z.string().uuid().safeParse(groupId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    await deps.treatmentProgram.deleteTemplateStageGroup(groupId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 404 });
  }
}
