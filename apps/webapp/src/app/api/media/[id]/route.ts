import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { logger } from "@/infra/logging/logger";
import { getStoredMediaBody } from "@/infra/repos/mockMediaStorage";
import { getMediaS3KeyForRedirect } from "@/infra/repos/s3MediaStorage";
import { presignGetUrl } from "@/infra/s3/client";
import { getCurrentSession } from "@/modules/auth/service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (env.DATABASE_URL && UUID_RE.test(id)) {
    const s3Key = await getMediaS3KeyForRedirect(id);
    if (s3Key) {
      try {
        const signed = await presignGetUrl(s3Key);
        const res = NextResponse.redirect(signed, 302);
        res.headers.set("Cache-Control", "private, max-age=0, must-revalidate");
        return res;
      } catch (e) {
        logger.error({ err: e }, "[media GET] presign failed");
        return NextResponse.json({ error: "storage_error" }, { status: 503 });
      }
    }
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const stored = getStoredMediaBody(id);
  if (!stored) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new Response(stored.body, {
    headers: {
      "Content-Type": stored.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
