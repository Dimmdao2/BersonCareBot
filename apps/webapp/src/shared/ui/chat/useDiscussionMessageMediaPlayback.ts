'use client';

import { useEffect, useState } from 'react';
import type { MediaPlaybackPayload } from '@/modules/media/playbackPayloadTypes';

const PENDING_PREVIEW_POLL_MS = 2_500;

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
    let pollId: number | undefined;
    const load = async () => {
      try {
        const response = await fetch(`/api/media/${encodeURIComponent(mediaId)}/playback`);
        if (!response.ok) throw new Error(`media playback metadata: ${response.status}`);
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('mediaId' in data)) {
          throw new Error('media playback metadata: invalid payload');
        }
        const payload = data as MediaPlaybackPayload;
        if (cancelled) return;
        setPlaybackResult({ mediaId, payload });
        setFailedMediaId((current) => (current === mediaId ? null : current));
        if (payload.preview.status === 'pending') {
          pollId = window.setTimeout(() => void load(), PENDING_PREVIEW_POLL_MS);
        }
      } catch {
        if (!cancelled) setFailedMediaId(mediaId);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (pollId !== undefined) window.clearTimeout(pollId);
    };
  }, [mediaId]);

  const playback = mediaId && playbackResult?.mediaId === mediaId ? playbackResult.payload : null;
  return {
    playback,
    failed: Boolean(mediaId) && failedMediaId === mediaId,
    isVideo: playback?.delivery === 'mp4' || playback?.delivery === 'hls',
  };
}
