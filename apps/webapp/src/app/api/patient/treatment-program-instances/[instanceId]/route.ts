import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";

export async function GET(
  _request: Request,
  context: { params: Promise<{ instanceId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const raw = await deps.treatmentProgramInstance.getInstanceForPatient(
      gate.session.user.userId,
      instanceId,
    );
    const item = omitDisabledInstanceStageItemsForPatientApi(raw);
    return NextResponse.json({ ok: true, item });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
