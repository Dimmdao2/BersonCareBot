import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";
import { assertMediaPlaybackAccess } from "@/modules/media/assertMediaPlaybackAccess";
import {
  recordPlaybackClientEvent,
  type PlaybackClientDelivery,
  type PlaybackClientEventClass,
} from "@/app-layer/media/playbackClientEvents";

const KNOWN_EVENTS: PlaybackClientEventClass[] = [
  "hls_fatal",
  "video_error",
  "hls_import_failed",
  "playback_refetch_failed",
  "playback_refetch_exception",
  "hls_js_unsupported",
];

function asPlaybackEventClass(value: unknown): PlaybackClientEventClass | null {
  if (typeof value !== "string") return null;
  return KNOWN_EVENTS.includes(value as PlaybackClientEventClass)
    ? (value as PlaybackClientEventClass)
    : null;
}

function asDelivery(value: unknown): PlaybackClientDelivery | null {
  if (value === "hls" || value === "mp4" || value === "file") return value;
  return null;
}

/**
 * Client telemetry ingress for playback failures.
 * Keeps payload tiny/safe; server stores aggregate-friendly rows for admin health.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const session = await getCurrentSession();
  if (!assertMediaPlaybackAccess(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const eventClass = asPlaybackEventClass((body as { eventClass?: unknown } | null)?.eventClass);
  const delivery = asDelivery((body as { delivery?: unknown } | null)?.delivery);
  const errorDetail =
    typeof (body as { errorDetail?: unknown } | null)?.errorDetail === "string"
      ? (body as { errorDetail?: string }).errorDetail
      : null;

  if (!eventClass) {
    return NextResponse.json({ error: "invalid_event_class" }, { status: 400 });
  }

  await recordPlaybackClientEvent({
    mediaId: id,
    userId: session.user.userId,
    eventClass,
    delivery: delivery ?? undefined,
    errorDetail,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
