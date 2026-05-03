import type { MediaAvailableQuality } from "./types";

/** JSON body of GET /api/media/[id]/playback; safe to pass RSC → client as props. */
export type MediaPlaybackPayload = {
  mediaId: string;
  delivery: "hls" | "mp4" | "file";
  mimeType: string;
  durationSeconds: number | null;
  posterUrl: string | null;
  hls: { masterUrl: string; qualities?: MediaAvailableQuality[] } | null;
  mp4: { url: string };
  fallbackUsed: boolean;
  expiresInSeconds: number;
};
