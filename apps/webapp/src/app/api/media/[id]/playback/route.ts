import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";
import { assertMediaPlaybackAccess } from "@/modules/media/assertMediaPlaybackAccess";
import type { PlaybackDeliveryStrategy } from "@/modules/media/playbackResolveDelivery";
import { resolveMediaPlaybackPayload } from "@/app-layer/media/resolveMediaPlaybackPayload";
import { getMediaAccessRow } from "@/app-layer/media/s3MediaStorage";

function parsePreferParam(raw: string | null): PlaybackDeliveryStrategy | null {
  if (!raw) return null;
  const p = raw.trim().toLowerCase();
  if (p === "mp4" || p === "hls" || p === "auto") return p;
  return null;
}

/**
 * GET /api/media/[id]/playback — JSON playback descriptor (HLS master + poster presigned, MP4 via redirect path).
 * Phase-04: gated by `video_playback_api_enabled`; session required (same family as GET /api/media/[id]).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const session = await getCurrentSession();
  const accessRow = await getMediaAccessRow(id);
  if (!accessRow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (
    !assertMediaPlaybackAccess(session, {
      usagePurpose: accessRow.usage_purpose,
      uploadedBy: accessRow.uploaded_by,
    })
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const prefer = parsePreferParam(new URL(request.url).searchParams.get("prefer"));
  const adminPrefer = session.user.role === "admin" ? prefer : null;

  const result = await resolveMediaPlaybackPayload({
    id,
    session,
    adminPrefer,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
