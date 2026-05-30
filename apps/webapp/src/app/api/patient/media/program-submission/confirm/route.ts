import { NextResponse } from "next/server";
import { z } from "zod";
import { env, isS3MediaEnabled } from "@/config/env";
import {
  confirmProgramSubmissionMediaFileReady,
  deletePendingMediaFileById,
  getMediaRowForConfirm,
} from "@/app-layer/media/s3MediaStorage";
import { enqueueProgramSubmissionTranscodeAfterConfirm } from "@/app-layer/media/programSubmissionTranscodeEnqueue";
import { s3HeadObjectDetails } from "@/app-layer/media/s3Client";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  isProgramSubmissionVideoMime,
  validateProgramSubmissionS3Head,
} from "@/modules/media/programSubmissionUploadLimits";
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
      processing: isProgramSubmissionVideoMime(row.mime_type),
    });
  }

  if (row.status !== "pending") {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 409 });
  }

  const head = await s3HeadObjectDetails(row.s3_key);
  if (!head) {
    return NextResponse.json({ ok: false, error: "file_not_found_in_s3" }, { status: 404 });
  }

  const declaredSize = row.size_bytes ?? head.contentLength;
  const s3Check = validateProgramSubmissionS3Head({
    declaredMime: row.mime_type,
    declaredSizeBytes: declaredSize,
    contentLength: head.contentLength,
    contentType: head.contentType,
  });
  if (!s3Check.ok) {
    await deletePendingMediaFileById(parsed.data.mediaId).catch(() => {
      /* best-effort */
    });
    const status = s3Check.error === "file_too_large" ? 413 : 415;
    return NextResponse.json({ ok: false, error: s3Check.error }, { status });
  }

  const updated = await confirmProgramSubmissionMediaFileReady(parsed.data.mediaId);
  if (!updated) {
    const again = await getMediaRowForConfirm(parsed.data.mediaId, gate.session.user.userId);
    if (again?.status === "ready" && again.s3_key) {
      return NextResponse.json({
        ok: true as const,
        url: appUrl,
        mediaId: parsed.data.mediaId,
        processing: isProgramSubmissionVideoMime(again.mime_type),
      });
    }
    return NextResponse.json({ ok: false, error: "confirm_race" }, { status: 409 });
  }

  const isVideo = isProgramSubmissionVideoMime(row.mime_type);
  let processing = false;
  if (isVideo) {
    const enq = await enqueueProgramSubmissionTranscodeAfterConfirm(parsed.data.mediaId);
    processing = enq.ok;
  }

  return NextResponse.json({
    ok: true as const,
    url: appUrl,
    mediaId: parsed.data.mediaId,
    processing,
  });
}
