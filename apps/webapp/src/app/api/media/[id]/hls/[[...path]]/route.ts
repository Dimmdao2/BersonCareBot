import { NextResponse } from "next/server";
import { logger } from "@/app-layer/logging/logger";
import { handleHlsDeliveryProxyRequest } from "@/app-layer/media/hlsDeliveryProxy";
import { getCurrentSession } from "@/modules/auth/service";
import { assertMediaPlaybackAccess } from "@/modules/media/assertMediaPlaybackAccess";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/media/[id]/hls/[[...path]] — authorized streaming proxy for HLS artifacts (same ACL family as playback JSON).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; path?: string[] }> }) {
  const { id, path } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const session = await getCurrentSession();
  if (!assertMediaPlaybackAccess(session)) {
    logger.warn({ mediaId: id, reasonCode: "session_unauthorized", httpStatus: 401 }, "hls_proxy_error");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const playbackEnabled = await getConfigBool("video_playback_api_enabled", false);
  if (!playbackEnabled) {
    return NextResponse.json({ error: "feature_disabled" }, { status: 503 });
  }

  return handleHlsDeliveryProxyRequest({
    mediaId: id,
    pathSegments: path,
    rangeHeader: request.headers.get("Range"),
    userId: session.user.userId,
  });
}
