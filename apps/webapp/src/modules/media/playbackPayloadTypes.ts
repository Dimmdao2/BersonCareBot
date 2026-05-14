import type { MediaAvailableQuality } from "./types";

/** JSON body of GET /api/media/[id]/playback; safe to pass RSC → client as props. */
export type MediaPlaybackPayload = {
  mediaId: string;
  delivery: "hls" | "mp4" | "file";
  mimeType: string;
  durationSeconds: number | null;
  posterUrl: string | null;
  /** When delivery is HLS, `masterUrl` is same-origin `/api/media/{id}/hls/master.m3u8` (cookie session). */
  hls: { masterUrl: string; qualities?: MediaAvailableQuality[] } | null;
  mp4: { url: string };
  fallbackUsed: boolean;
  /** TTL for poster presign and MP4 presigned redirect (`GET /api/media/{id}`); not applied to HLS master URL. */
  expiresInSeconds: number;
};
