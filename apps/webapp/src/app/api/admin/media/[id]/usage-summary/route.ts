import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { webappReposAreInMemory } from "@/config/env";
import { getCurrentSession } from "@/modules/auth/service";
import { formatMediaUsageSummaryLines } from "@/modules/media/usageSummaryFormat";
import { canAccessDoctor } from "@/modules/roles/service";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

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
  const summary = await deps.media.getUsageSummary(parsed.data.id);
  const lines = formatMediaUsageSummaryLines(summary);
  const total =
    summary.materials +
    summary.exercises +
    summary.clinicalTests +
    summary.recommendations +
    summary.sections;

  return NextResponse.json({ ok: true, summary, lines, total });
}
