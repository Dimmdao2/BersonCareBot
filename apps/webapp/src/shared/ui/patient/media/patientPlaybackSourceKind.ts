import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";

/** Режим источника внутри {@link PatientMediaPlaybackVideo} (согласован с ответом `GET /api/media/[id]/playback`). */
export function initialPlaybackSourceKind(payload: MediaPlaybackPayload): "hls" | "mp4" {
  return payload.delivery === "hls" && Boolean(payload.hls?.masterUrl) ? "hls" : "mp4";
}
