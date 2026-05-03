import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { logger } from "@/app-layer/logging/logger";
import {
  PLAYBACK_HOURLY_STATS_RETENTION_DAYS,
  purgeStalePlaybackHourlyStats,
} from "@/app-layer/media/playbackHourlyRetention";

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * HOUSEKEEPING: trims `media_playback_stats_hourly` older than retention window.
 *
 * Bearer `INTERNAL_JOB_SECRET`, optional query `dryRun=1`, `days=<positive int>` (defaults to repo constant).
 *
 * Dedup таблица `media_playback_user_video_first_resolve` deliberately **не** затрагивается.
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

  let dryRun = false;
  let retentionDays = PLAYBACK_HOURLY_STATS_RETENTION_DAYS;
  try {
    const url = new URL(request.url);
    dryRun =
      url.searchParams.get("dryRun") === "1" ||
      url.searchParams.get("dry_run") === "1" ||
      url.searchParams.get("dry_run") === "true";
    const daysRaw = url.searchParams.get("days");
    if (daysRaw != null && daysRaw.trim() !== "") {
      const parsed = Number.parseInt(daysRaw, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return NextResponse.json({ ok: false, error: "invalid_days" }, { status: 400 });
      }
      retentionDays = parsed;
    }
  } catch {
    /* ignore */
  }

  const result = await purgeStalePlaybackHourlyStats({
    dryRun,
    retentionDays,
  });

  logger.info(
    { dryRun: result.dryRun, deleted: result.deleted, retentionDays: result.retentionDays },
    "media_playback_stats_retention_job",
  );

  return NextResponse.json({
    ok: true,
    deleted: result.deleted,
    dryRun: result.dryRun,
    retentionDays: result.retentionDays,
  });
}
