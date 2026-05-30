import { NextResponse } from "next/server";
import { z } from "zod";
import { getMediaRowForProgramSubmissionAttach } from "@/app-layer/media/s3MediaStorage";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isPatientProgramDiscussionMediaFlowEnabled } from "@/modules/program-item-discussion/discussionFeatureGates";

export async function GET(
  _request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  if (!(await isPatientProgramDiscussionMediaFlowEnabled(deps))) {
    return NextResponse.json({ ok: false, error: "feature_disabled" }, { status: 403 });
  }

  const { mediaId } = await context.params;
  if (!z.string().uuid().safeParse(mediaId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const row = await getMediaRowForProgramSubmissionAttach(mediaId, gate.session.user.userId);
  return NextResponse.json({ ok: true, ready: row != null });
}
