import { NextResponse } from "next/server";
import { z } from "zod";
import { env, isS3MediaEnabled } from "@/config/env";
import { confirmMediaFileReady, getMediaRowForConfirm } from "@/app-layer/media/s3MediaStorage";
import { maybeAutoEnqueueVideoTranscodeAfterUpload } from "@/app-layer/media/mediaTranscodeAutoEnqueue";
import { s3HeadObject } from "@/app-layer/media/s3Client";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const bodySchema = z.object({
  mediaId: z.string().uuid(),
});

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: "s3_not_configured" }, { status: 501 });
  }

  const session = await getCurrentSession();
  if (!session || !canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
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

  const row = await getMediaRowForConfirm(parsed.data.mediaId, session.user.userId);
  if (!row) {
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

  const updated = await confirmMediaFileReady(parsed.data.mediaId);
  if (!updated) {
    const again = await getMediaRowForConfirm(parsed.data.mediaId, session.user.userId);
    if (again?.status === "ready" && again.s3_key) {
      return NextResponse.json({
        ok: true as const,
        url: appUrl,
        mediaId: parsed.data.mediaId,
      });
    }
    return NextResponse.json({ ok: false, error: "confirm_race" }, { status: 409 });
  }

  await maybeAutoEnqueueVideoTranscodeAfterUpload(parsed.data.mediaId);

  return NextResponse.json({
    ok: true as const,
    url: appUrl,
    mediaId: parsed.data.mediaId,
  });
}
