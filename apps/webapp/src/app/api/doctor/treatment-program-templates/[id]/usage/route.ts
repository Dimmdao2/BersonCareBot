import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const deps = buildAppDeps();
  const usage = await deps.treatmentProgram.getTreatmentProgramTemplateUsage(id);
  return NextResponse.json({ ok: true, usage });
}
