import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { webappReposAreInMemory } from "@/config/env";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { formatMediaUsageSummaryLines } from "@/modules/media/usageSummaryFormat";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const rawParams = await context.params;
  const parsed = paramsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  if (webappReposAreInMemory()) {
    return NextResponse.json({
      ok: true,
      summary: {
        materials: 0,
        exercises: 0,
        clinicalTests: 0,
        recommendations: 0,
        sections: 0,
      },
      lines: [] as string[],
    });
  }

  const deps = buildAppDeps();
  const media = await withDoctorWorkspacePrincipal(gate.ctx, () => deps.media.getById(parsed.data.id));
  if (!media) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const summary = await withDoctorWorkspacePrincipal(gate.ctx, () => deps.media.getUsageSummary(parsed.data.id));
  const lines = formatMediaUsageSummaryLines(summary);
  const total =
    summary.materials +
    summary.exercises +
    summary.clinicalTests +
    summary.recommendations +
    summary.sections;

  return NextResponse.json({ ok: true, summary, lines, total });
}
