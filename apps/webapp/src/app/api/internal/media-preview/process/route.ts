import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { logger } from "@/app-layer/logging/logger";
import { processMediaPreviewBatch } from "@/app-layer/media/mediaPreviewWorker";

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * POST — generate preview JPEGs for `media_files` rows with `preview_status = 'pending'`.
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`. Configure cron to call periodically.
 */
export async function POST(request: Request) {
  const secret = env.INTERNAL_JOB_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !bearerMatchesSecret(token, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let limit = 10;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("limit");
    if (q) limit = Number.parseInt(q, 10);
  } catch {
    /* ignore */
  }

  try {
    const { processed, errors } = await processMediaPreviewBatch(Number.isFinite(limit) ? limit : 10);
    return NextResponse.json({ ok: true, processed, errors });
  } catch (e) {
    logger.error({ err: e }, "[internal/media-preview/process] failed");
    return NextResponse.json({ ok: false, error: "process_failed" }, { status: 500 });
  }
}
