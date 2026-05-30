import { NextResponse } from "next/server";
import { z } from "zod";
import { env, isS3MediaEnabled } from "@/config/env";
import {
  confirmProgramSubmissionMediaFileReady,
  getMediaRowForConfirm,
} from "@/app-layer/media/s3MediaStorage";
import { enqueueProgramSubmissionTranscodeAfterConfirm } from "@/app-layer/media/programSubmissionTranscodeEnqueue";
import { s3HeadObject } from "@/app-layer/media/s3Client";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { isProgramSubmissionVideoMime } from "@/modules/media/programSubmissionUploadLimits";
import { isPatientProgramDiscussionMediaFlowEnabled } from "@/modules/program-item-discussion/discussionFeatureGates";

const bodySchema = z.object({
  mediaId: z.string().uuid(),
});

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: "s3_not_configured" }, { status: 501 });
  }

  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  if (!(await isPatientProgramDiscussionMediaFlowEnabled(deps))) {
    return NextResponse.json({ ok: false, error: "feature_disabled" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const row = await getMediaRowForConfirm(parsed.data.mediaId, gate.session.user.userId);
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (row.usage_purpose !== "program_item_submission") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!row.s3_key) {
    return NextResponse.json({ ok: false, error: "missing_s3_key" }, { status: 500 });
  }

  const appUrl = `/api/media/${parsed.data.mediaId}`;

  if (row.status === "ready") {
    return NextResponse.json({
      ok: true as const,
      url: appUrl,
      mediaId: parsed.data.mediaId,
    });
  }

  if (row.status !== "pending") {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 409 });
  }

  const exists = await s3HeadObject(row.s3_key);
  if (!exists) {
    return NextResponse.json({ ok: false, error: "file_not_found_in_s3" }, { status: 404 });
  }

  const updated = await confirmProgramSubmissionMediaFileReady(parsed.data.mediaId);
  if (!updated) {
    const again = await getMediaRowForConfirm(parsed.data.mediaId, gate.session.user.userId);
    if (again?.status === "ready" && again.s3_key) {
      return NextResponse.json({
        ok: true as const,
        url: appUrl,
        mediaId: parsed.data.mediaId,
      });
    }
    return NextResponse.json({ ok: false, error: "confirm_race" }, { status: 409 });
  }

  if (isProgramSubmissionVideoMime(row.mime_type)) {
    await enqueueProgramSubmissionTranscodeAfterConfirm(parsed.data.mediaId);
  }

  return NextResponse.json({
    ok: true as const,
    url: appUrl,
    mediaId: parsed.data.mediaId,
  });
}
