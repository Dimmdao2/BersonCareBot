import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { logger } from "@/app-layer/logging/logger";
import { mediaPlaybackClientEvents } from "../../../db/schema";

export type PlaybackClientEventClass =
  | "hls_fatal"
  | "video_error"
  | "hls_import_failed"
  | "playback_refetch_failed"
  | "playback_refetch_exception"
  | "hls_js_unsupported";

export type PlaybackClientDelivery = "hls" | "mp4" | "file";

const KNOWN_EVENT_CLASSES: PlaybackClientEventClass[] = [
  "hls_fatal",
  "video_error",
  "hls_import_failed",
  "playback_refetch_failed",
  "playback_refetch_exception",
  "hls_js_unsupported",
];

function floorUtcHourIso(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0),
  ).toISOString();
}

function cutoffIso(hours: number): string {
  return new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000).toISOString();
}

function trimTo(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  return v.length > max ? v.slice(0, max) : v;
}

export async function recordPlaybackClientEvent(input: {
  mediaId: string;
  userId: string;
  eventClass: PlaybackClientEventClass;
  delivery?: PlaybackClientDelivery;
  errorDetail?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const db = getDrizzle();
    await db.insert(mediaPlaybackClientEvents).values({
      mediaId: input.mediaId,
      userId: input.userId,
      eventClass: input.eventClass,
      delivery: input.delivery ?? null,
      errorDetail: trimTo(input.errorDetail, 500),
      userAgent: trimTo(input.userAgent, 400),
    });
  } catch (e) {
    logger.error(
      {
        err: e,
        mediaId: input.mediaId,
        userId: input.userId,
        eventClass: input.eventClass,
      },
      "playback_client_event_write_failed",
    );
  }
}

export type AdminPlaybackClientHealthMetrics = {
  windowHours: number;
  totalErrors: number;
  totalErrorsLast1h: number;
  byEvent: Record<PlaybackClientEventClass, number>;
  byEventLast1h: Record<PlaybackClientEventClass, number>;
  byDelivery: { hls: number; mp4: number; file: number };
  recent: Array<{
    createdAt: string;
    mediaId: string;
    eventClass: PlaybackClientEventClass;
    delivery: PlaybackClientDelivery | null;
    errorDetail: string | null;
  }>;
  likelyLooping: boolean;
};

function emptyByEvent(): Record<PlaybackClientEventClass, number> {
  return {
    hls_fatal: 0,
    video_error: 0,
    hls_import_failed: 0,
    playback_refetch_failed: 0,
    playback_refetch_exception: 0,
    hls_js_unsupported: 0,
  };
}

export async function loadAdminPlaybackClientHealthMetrics(opts?: {
  windowHours?: number;
}): Promise<AdminPlaybackClientHealthMetrics> {
  const windowHours =
    typeof opts?.windowHours === "number" && Number.isFinite(opts.windowHours) && opts.windowHours > 0
      ? Math.floor(opts.windowHours)
      : 24;
  const db = getDrizzle();
  const cutoff24 = cutoffIso(windowHours);
  const cutoff1h = cutoffIso(1);
  const currentUtcHour = floorUtcHourIso();

  const [totals24, totals1h, delivery24, recent] = await Promise.all([
    db
      .select({
        eventClass: mediaPlaybackClientEvents.eventClass,
        c: sql<string>`count(*)::text`,
      })
      .from(mediaPlaybackClientEvents)
      .where(gte(mediaPlaybackClientEvents.createdAt, cutoff24))
      .groupBy(mediaPlaybackClientEvents.eventClass),
    db
      .select({
        eventClass: mediaPlaybackClientEvents.eventClass,
        c: sql<string>`count(*)::text`,
      })
      .from(mediaPlaybackClientEvents)
      .where(gte(mediaPlaybackClientEvents.createdAt, cutoff1h))
      .groupBy(mediaPlaybackClientEvents.eventClass),
    db
      .select({
        delivery: mediaPlaybackClientEvents.delivery,
        c: sql<string>`count(*)::text`,
      })
      .from(mediaPlaybackClientEvents)
      .where(and(gte(mediaPlaybackClientEvents.createdAt, cutoff24), sql`${mediaPlaybackClientEvents.delivery} IS NOT NULL`))
      .groupBy(mediaPlaybackClientEvents.delivery),
    db
      .select({
        createdAt: mediaPlaybackClientEvents.createdAt,
        mediaId: mediaPlaybackClientEvents.mediaId,
        eventClass: mediaPlaybackClientEvents.eventClass,
        delivery: mediaPlaybackClientEvents.delivery,
        errorDetail: mediaPlaybackClientEvents.errorDetail,
      })
      .from(mediaPlaybackClientEvents)
      .where(gte(mediaPlaybackClientEvents.createdAt, cutoff24))
      .orderBy(desc(mediaPlaybackClientEvents.createdAt))
      .limit(10),
  ]);

  // Detect aggressive retry loops: same media + class 3+ times in current UTC hour.
  const loops = await db
    .select({
      mediaId: mediaPlaybackClientEvents.mediaId,
      eventClass: mediaPlaybackClientEvents.eventClass,
      c: sql<string>`count(*)::text`,
    })
    .from(mediaPlaybackClientEvents)
    .where(and(gte(mediaPlaybackClientEvents.createdAt, currentUtcHour), eq(mediaPlaybackClientEvents.eventClass, "hls_fatal")))
    .groupBy(mediaPlaybackClientEvents.mediaId, mediaPlaybackClientEvents.eventClass);

  const byEvent = emptyByEvent();
  const byEventLast1h = emptyByEvent();
  let totalErrors = 0;
  let totalErrorsLast1h = 0;
  for (const row of totals24) {
    if (!KNOWN_EVENT_CLASSES.includes(row.eventClass as PlaybackClientEventClass)) continue;
    const n = Number.parseInt(row.c, 10) || 0;
    byEvent[row.eventClass as PlaybackClientEventClass] = n;
    totalErrors += n;
  }
  for (const row of totals1h) {
    if (!KNOWN_EVENT_CLASSES.includes(row.eventClass as PlaybackClientEventClass)) continue;
    const n = Number.parseInt(row.c, 10) || 0;
    byEventLast1h[row.eventClass as PlaybackClientEventClass] = n;
    totalErrorsLast1h += n;
  }

  const byDelivery = { hls: 0, mp4: 0, file: 0 };
  for (const row of delivery24) {
    const n = Number.parseInt(row.c, 10) || 0;
    if (row.delivery === "hls") byDelivery.hls = n;
    else if (row.delivery === "mp4") byDelivery.mp4 = n;
    else if (row.delivery === "file") byDelivery.file = n;
  }

  const likelyLooping = loops.some((row) => (Number.parseInt(row.c, 10) || 0) >= 3);

  return {
    windowHours,
    totalErrors,
    totalErrorsLast1h,
    byEvent,
    byEventLast1h,
    byDelivery,
    recent: recent.map((r) => ({
      createdAt: r.createdAt,
      mediaId: r.mediaId,
      eventClass: KNOWN_EVENT_CLASSES.includes(r.eventClass as PlaybackClientEventClass)
        ? (r.eventClass as PlaybackClientEventClass)
        : "video_error",
      delivery:
        r.delivery === "hls" || r.delivery === "mp4" || r.delivery === "file"
          ? r.delivery
          : null,
      errorDetail: r.errorDetail ?? null,
    })),
    likelyLooping,
  };
}
