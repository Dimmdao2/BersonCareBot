import { NextResponse } from "next/server";
import { z } from "zod";
import { webappReposAreInMemory } from "@/config/env";
import { pgListExerciseUsageForMediaIds } from "@/app-layer/lfk/pgLfkExercisesQueries";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).max(200),
});

export async function POST(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  if (webappReposAreInMemory() || parsed.data.ids.length === 0) {
    return NextResponse.json({ ok: true, usage: {} as Record<string, unknown> });
  }

  const deps = buildAppDeps();
  const media = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    Promise.all(parsed.data.ids.map((id) => deps.media.getById(id))),
  );
  if (media.some((row) => row === null)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const usage = await withDoctorWorkspacePrincipal(gate.ctx, () => pgListExerciseUsageForMediaIds(parsed.data.ids));
  return NextResponse.json({ ok: true, usage });
}
