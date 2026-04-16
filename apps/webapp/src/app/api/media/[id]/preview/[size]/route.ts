import { NextResponse } from "next/server";
import { logger } from "@/infra/logging/logger";
import { getMediaPreviewS3KeyForRedirect } from "@/infra/repos/s3MediaStorage";
import { presignGetUrl } from "@/infra/s3/client";
import { getCurrentSession } from "@/modules/auth/service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PREVIEW_CACHE_MAX_AGE = 3500;

async function redirectPresignedPreview(s3Key: string): Promise<Response> {
  try {
    const signed = await presignGetUrl(s3Key);
    const res = NextResponse.redirect(signed, 307);
    res.headers.set("Cache-Control", `private, max-age=${PREVIEW_CACHE_MAX_AGE}`);
    return res;
  } catch (e) {
    logger.error({ err: e }, "[media preview GET] presign failed");
    return NextResponse.json({ error: "storage_error" }, { status: 503 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; size: string }> },
) {
  const { id, size: sizeRaw } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const size = sizeRaw === "sm" || sizeRaw === "md" ? sizeRaw : null;
  if (!size) {
    return NextResponse.json({ error: "invalid size" }, { status: 400 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const s3Key = await getMediaPreviewS3KeyForRedirect(id, size);
  if (!s3Key) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return redirectPresignedPreview(s3Key);
}
