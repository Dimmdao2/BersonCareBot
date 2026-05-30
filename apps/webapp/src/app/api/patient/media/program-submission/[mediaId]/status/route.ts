import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProgramSubmissionMediaStatusRow,
  isProgramSubmissionMediaAttachReady,
} from "@/app-layer/media/s3MediaStorage";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isPatientProgramDiscussionMediaFlowEnabled } from "@/modules/program-item-discussion/discussionFeatureGates";

export type ProgramSubmissionMediaStatusState = "ready" | "processing" | "failed" | "pending";

function resolveProgramSubmissionStatusState(
  row: NonNullable<Awaited<ReturnType<typeof getProgramSubmissionMediaStatusRow>>>,
): ProgramSubmissionMediaStatusState {
  if (isProgramSubmissionMediaAttachReady(row)) return "ready";
  if (!row.mime_type.toLowerCase().startsWith("video/")) {
    return row.status === "ready" ? "ready" : "pending";
  }
  if (row.video_processing_status === "failed") return "failed";
  if (row.video_processing_status === "ready") return "ready";
  if (row.video_processing_status === "pending" || row.video_processing_status === "processing") {
    return "processing";
  }
  return row.status === "ready" ? "processing" : "pending";
}

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

  const row = await getProgramSubmissionMediaStatusRow(mediaId, gate.session.user.userId);
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const state = resolveProgramSubmissionStatusState(row);
  const ready = state === "ready";

  return NextResponse.json({
    ok: true,
    ready,
    state,
    ...(state === "failed" && row.video_processing_error
      ? { error: row.video_processing_error }
      : {}),
  });
}
