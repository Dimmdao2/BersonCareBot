import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { logger } from "@/app-layer/logging/logger";
import { getMediaPreviewS3KeyForRedirect } from "@/app-layer/media/s3MediaStorage";
import { presignGetUrl, s3GetObjectBody, s3HeadObjectDetails } from "@/app-layer/media/s3Client";
import { getCurrentSession } from "@/modules/auth/service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CACHE_CONTROL = "private, max-age=86400, stale-while-revalidate=604800";
const FALLBACK_REDIRECT_EXPIRES_SEC = 86400;

async function redirectPresignedPreview(s3Key: string): Promise<Response> {
  try {
    const signed = await presignGetUrl(s3Key, FALLBACK_REDIRECT_EXPIRES_SEC);
    const res = NextResponse.redirect(signed, 307);
    res.headers.set("Cache-Control", CACHE_CONTROL);
    return res;
  } catch (e) {
    logger.error({ err: e }, "[preview GET] presign failed");
    return NextResponse.json({ error: "storage_error" }, { status: 503 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; size: string }> }) {
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
    logger.warn({ mediaId: id, size }, "[preview GET] not found");
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ifNoneMatch = request.headers.get("if-none-match");
  const ifModifiedSinceRaw = request.headers.get("if-modified-since");
  const head = await s3HeadObjectDetails(s3Key);
  let etag = head?.eTag?.trim() || null;
  const validatorSource: "s3" | "sha256" = etag ? "s3" : "sha256";
  const lastModifiedFromHead = head?.lastModified ?? null;

  if (
    !ifNoneMatch &&
    ifModifiedSinceRaw &&
    etag &&
    lastModifiedFromHead &&
    !Number.isNaN(Date.parse(ifModifiedSinceRaw)) &&
    lastModifiedFromHead.getTime() <= Date.parse(ifModifiedSinceRaw) + 1000
  ) {
    logger.debug({ mediaId: id, size, validatorSource, cacheHit: true }, "[preview GET] not modified (If-Modified-Since)");
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": CACHE_CONTROL,
        "Last-Modified": lastModifiedFromHead.toUTCString(),
      },
    });
  }

  if (etag && ifNoneMatch && ifNoneMatch === etag) {
    logger.debug({ mediaId: id, size, validatorSource, cacheHit: true }, "[preview GET] not modified (ETag)");
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": CACHE_CONTROL,
        ...(lastModifiedFromHead ? { "Last-Modified": lastModifiedFromHead.toUTCString() } : {}),
      },
    });
  }

  const body = await s3GetObjectBody(s3Key);
  if (!body?.length) {
    logger.error({ mediaId: id, size }, "[preview GET] s3 read failed");
    logger.warn({ mediaId: id, size }, "[preview GET] fallback redirect used");
    return redirectPresignedPreview(s3Key);
  }

  if (!etag) {
    etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;
  }
  const lastModified = lastModifiedFromHead ?? new Date();

  if (ifNoneMatch && ifNoneMatch === etag) {
    logger.debug({ mediaId: id, size, validatorSource, cacheHit: true }, "[preview GET] not modified (ETag, after body read)");
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": CACHE_CONTROL,
        "Last-Modified": lastModified.toUTCString(),
      },
    });
  }

  logger.debug({ mediaId: id, size, validatorSource, cacheHit: false }, "[preview GET] served body");

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": CACHE_CONTROL,
      ETag: etag,
      "Last-Modified": lastModified.toUTCString(),
    },
  });
}
