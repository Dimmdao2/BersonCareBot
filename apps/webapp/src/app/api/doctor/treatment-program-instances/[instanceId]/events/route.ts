import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { resolveDoctorInstanceInWorkspace } from "../../_doctorInstanceWorkspace";

export async function GET(
  _request: Request,
  context: { params: Promise<{ instanceId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const resolved = await resolveDoctorInstanceInWorkspace(deps, gate.ctx, instanceId);
    if (!resolved.ok) return resolved.response;
    const events = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgramInstance.listProgramEvents(instanceId),
    );
    return NextResponse.json({ ok: true, events });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
