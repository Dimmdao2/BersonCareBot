import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";

const postBodySchema = z.object({
  orderedItemIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: Request, ctx: { params: Promise<{ stageId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { stageId } = await ctx.params;
  if (!z.string().uuid().safeParse(stageId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgram.reorderTemplateStageItems(stageId, parsed.data.orderedItemIds),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
