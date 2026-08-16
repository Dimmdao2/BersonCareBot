import type { MediaAvailableQuality, MediaPreviewStatus } from './types';

/** JSON body of GET /api/media/[id]/playback; safe to pass RSC → client as props. */
export type MediaPlaybackPayload = {
  mediaId: string;
  delivery: 'hls' | 'mp4' | 'file';
  mimeType: string;
  durationSeconds: number | null;
  posterUrl: string | null;
  /** Canonical generated-preview state and same-origin routes; originals are never preview fallbacks. */
  preview: {
    status: MediaPreviewStatus;
    smUrl: string | null;
    mdUrl: string | null;
  };
  /** When delivery is HLS, `masterUrl` is same-origin `/api/media/{id}/hls/master.m3u8` (cookie session). */
  hls: { masterUrl: string; qualities?: MediaAvailableQuality[] } | null;
  mp4: { url: string };
  fallbackUsed: boolean;
  /** TTL for poster presign and MP4 presigned redirect (`GET /api/media/{id}`); not applied to HLS master URL. */
  expiresInSeconds: number;
};
