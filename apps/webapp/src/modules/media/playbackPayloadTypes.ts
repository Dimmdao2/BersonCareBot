import type { MediaAvailableQuality, MediaPreviewStatus } from './types';

/** JSON body of GET /api/media/[id]/playback; safe to pass RSC → client as props. */
export type MediaPlaybackPayload = {
  mediaId: string;
  delivery: 'hls' | 'mp4' | 'file';
  mimeType: string;
  durationSeconds: number | null;
  posterUrl: string | null;
  /** Canonical generated-preview state and same-origin routes; raw uploads are never shown. */
  preview: {
    status: MediaPreviewStatus;
    smUrl: string | null;
    mdUrl: string | null;
    /**
     * `media_files.standard_rendition_at IS NOT NULL`: the stored object is our encoder's bounded
     * output, so it may be shown while the thumbnail is still missing (owner ruling 19.08).
     */
    standardRendition: boolean;
  };
  /** When delivery is HLS, `masterUrl` is same-origin `/api/media/{id}/hls/master.m3u8` (cookie session). */
  hls: { masterUrl: string; qualities?: MediaAvailableQuality[] } | null;
  mp4: { url: string };
  fallbackUsed: boolean;
  /** TTL for poster presign and MP4 presigned redirect (`GET /api/media/{id}`); not applied to HLS master URL. */
  expiresInSeconds: number;
};
