'use client';

import { useEffect, useState } from 'react';
import type { MediaPlaybackPayload } from '@/modules/media/playbackPayloadTypes';

export type DiscussionMessageMediaPlayback = {
  /** Резолвнутый playback-JSON именно для запрошенного `mediaId`, иначе `null`. */
  playback: MediaPlaybackPayload | null;
  /** Запрос `/playback` для этого `mediaId` не удался. */
  failed: boolean;
  /** Доставка — видео (HLS или прогрессивный MP4). */
  isVideo: boolean;
};

/**
 * Ноль-UI модель медиа-сообщения обсуждения: один запрос `GET /api/media/[id]/playback`
 * и его состояние. Живёт вне зон, потому что и кабинет пациента, и кабинет врача рисуют
 * одно и то же сообщение своими примитивами (AGENTS.md §17: деревья UI не пересекаются).
 */
export function useDiscussionMessageMediaPlayback(
  mediaId: string | null,
): DiscussionMessageMediaPlayback {
  const [playbackResult, setPlaybackResult] = useState<{
    mediaId: string;
    payload: MediaPlaybackPayload;
  } | null>(null);
  const [failedMediaId, setFailedMediaId] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    void fetch(`/api/media/${encodeURIComponent(mediaId)}/playback`)
      .then((r) => {
        if (!r.ok) throw new Error(`media playback metadata: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled && data && typeof data === 'object' && 'mediaId' in data) {
          setPlaybackResult({ mediaId, payload: data as MediaPlaybackPayload });
        }
      })
      .catch(() => {
        if (!cancelled) setFailedMediaId(mediaId);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  const playback = mediaId && playbackResult?.mediaId === mediaId ? playbackResult.payload : null;
  return {
    playback,
    failed: Boolean(mediaId) && failedMediaId === mediaId,
    isVideo: playback?.delivery === 'mp4' || playback?.delivery === 'hls',
  };
}
