import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";

/** Начальный режим источника для dual-mode плеера (согласован с phase-05). */
export function initialPlaybackSourceKind(payload: MediaPlaybackPayload): "hls" | "mp4" {
  return payload.delivery === "hls" && Boolean(payload.hls?.masterUrl) ? "hls" : "mp4";
}
