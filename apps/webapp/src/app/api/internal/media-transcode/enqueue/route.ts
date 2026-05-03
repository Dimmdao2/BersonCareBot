import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { logger } from "@/app-layer/logging/logger";
import { enqueueMediaTranscodeJob } from "@/app-layer/media/mediaTranscodeJobs";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

const bodySchema = z.object({
  mediaId: z.string().uuid(),
});

/**
 * POST — enqueue a single HLS transcode job for `media_files.id` (video/*, readable, S3 key present).
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`. Respects `video_hls_pipeline_enabled` (503 when off).
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

  const enabled = await getConfigBool("video_hls_pipeline_enabled", false);
  if (!enabled) {
    return NextResponse.json({ ok: false, error: "pipeline_disabled" }, { status: 503 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const json: unknown = await request.json();
    parsed = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  try {
    const out = await enqueueMediaTranscodeJob(parsed.mediaId);
    if (!out.ok) {
      const status = out.error === "not_found" ? 404 : 400;
      return NextResponse.json({ ok: false, error: out.error }, { status });
    }
    if (out.kind === "already_ready") {
      return NextResponse.json({ ok: true, skipped: "already_ready" as const });
    }
    return NextResponse.json({
      ok: true,
      jobId: out.jobId,
      alreadyQueued: out.alreadyQueued,
    });
  } catch (e) {
    logger.error({ err: e }, "[internal/media-transcode/enqueue] failed");
    return NextResponse.json({ ok: false, error: "enqueue_failed" }, { status: 500 });
  }
}
