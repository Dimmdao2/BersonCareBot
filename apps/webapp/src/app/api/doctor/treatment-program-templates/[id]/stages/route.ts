import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";

const postBodySchema = z.object({
  title: z.string().min(1).max(2000),
  description: z.string().max(20000).optional().nullable(),
  goals: z.string().max(200000).optional().nullable(),
  objectives: z.string().max(200000).optional().nullable(),
  expectedDurationDays: z.number().int().min(0).max(36500).optional().nullable(),
  expectedDurationText: z.string().max(20000).optional().nullable(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { id: templateId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const stage = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgram.createStage(templateId, {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        goals: parsed.data.goals,
        objectives: parsed.data.objectives,
        expectedDurationDays: parsed.data.expectedDurationDays,
        expectedDurationText: parsed.data.expectedDurationText,
      }),
    );
    return NextResponse.json({ ok: true, stage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
