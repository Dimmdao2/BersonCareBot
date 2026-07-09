import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";

const patchBodySchema = z.object({
  title: z.string().min(1).max(2000).optional(),
  description: z.string().max(10000).optional().nullable(),
  scheduleText: z.string().max(5000).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

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
    const group = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgram.updateTemplateStageGroup(groupId, parsed.data),
    );
    return NextResponse.json({ ok: true, group });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: msg.includes("не найден") ? 404 : 400 });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { groupId } = await ctx.params;
  if (!z.string().uuid().safeParse(groupId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgram.deleteTemplateStageGroup(groupId),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 404 });
  }
}
