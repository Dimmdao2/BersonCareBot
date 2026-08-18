'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/patient/primitives/dialog';
import { PatientMediaPlaybackVideo } from '@/shared/ui/patient/media/PatientMediaPlaybackVideo';
import { PatientCatalogMediaStaticThumb } from '@/shared/ui/patient/PatientCatalogMediaStaticThumb';
import { MediaThumb } from '@/shared/ui/patient/media/MediaThumb';
import type { MediaPreviewUiModel } from '@/shared/ui/patient/media/mediaPreviewUiModel';
import { cn } from '@/lib/utils';
import { patientBodyTextClass } from '@/shared/ui/patient/patientVisual';
import type { MediaPlaybackPayload } from '@/modules/media/playbackPayloadTypes';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';

export function ProgramItemDiscussionMessageBody(props: {
  message: ProgramItemDiscussionMessage;
  mine: boolean;
}) {
  const { message, mine } = props;
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playbackResult, setPlaybackResult] = useState<{
    mediaId: string;
    payload: MediaPlaybackPayload;
  } | null>(null);
  const [failedMediaId, setFailedMediaId] = useState<string | null>(null);
  const mediaId = message.mediaFileId;

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

  if (mediaId) {
    const playback = playbackResult?.mediaId === mediaId ? playbackResult.payload : null;
    const playbackFailed = failedMediaId === mediaId;
    const isVideo = playback?.delivery === 'mp4' || playback?.delivery === 'hls';
    // Превью воркера — оптимизация, а не условие показа. Пока оно не готово (`pending`) или не
    // сделано вовсе (`skipped`/`failed`), фото в пузыре берётся из оригинала через ту же
    // авторизованную дверь `/api/media/<id>`, которой пользуется видео ниже. Так же уже устроены
    // `recommendationMediaItemToPreviewUi` и `templateListPreviewToPreviewUi` — для изображений
    // источником миниатюры служит сам файл. Без этого пациент видит пустой серый прямоугольник
    // вместо только что отправленного фото, и клик по нему ничего не открывает.
    const originalUrl = `/api/media/${encodeURIComponent(mediaId)}`;
    const workerThumbReady = playback?.preview.status === 'ready' && Boolean(playback.preview.smUrl);
    const imagePreview: MediaPreviewUiModel = {
      id: mediaId,
      kind: 'image',
      url: originalUrl,
      previewStatus: playbackFailed ? 'failed' : playback ? 'ready' : 'pending',
      previewSmUrl: workerThumbReady ? playback.preview.smUrl : playback ? originalUrl : null,
      previewMdUrl: workerThumbReady ? (playback.preview.mdUrl ?? null) : null,
    };
    const videoThumbMedia: import('@/modules/recommendations/types').RecommendationMediaItem | null =
      isVideo && playback?.posterUrl
        ? {
            mediaType: 'video',
            mediaUrl: playback.posterUrl,
            previewSmUrl: playback.posterUrl,
            previewMdUrl: playback.posterUrl,
            sortOrder: 0,
          }
        : null;

    return (
      <>
        <button
          type="button"
          className="block max-w-full overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
          onClick={() => {
            if (playback && (isVideo || imagePreview.previewSmUrl)) setPlayerOpen(true);
          }}
        >
          {isVideo ? (
            <PatientCatalogMediaStaticThumb
              media={videoThumbMedia}
              frameClassName="aspect-video w-44"
              sizes="176px"
            />
          ) : (
            <MediaThumb
              media={imagePreview}
              className="max-h-48 w-auto object-cover"
              imgClassName="max-h-48 w-auto object-cover"
              sizes="176px"
              alt=""
            />
          )}
        </button>
        <Dialog open={playerOpen} onOpenChange={setPlayerOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{isVideo ? 'Видео' : 'Фото'}</DialogTitle>
            </DialogHeader>
            {isVideo ? (
              <PatientMediaPlaybackVideo
                mediaId={mediaId}
                mp4Url={`/api/media/${encodeURIComponent(mediaId)}`}
                title="Видео"
                initialPlayback={playback}
              />
            ) : (
              <MediaThumb
                media={imagePreview}
                className="max-h-[70vh] w-full object-contain"
                imgClassName="max-h-[70vh] w-full object-contain"
                sizes="(max-width: 640px) 100vw, 672px"
                lazy={false}
                alt=""
              />
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (!message.body?.trim()) return null;

  return (
    <p className={cn('whitespace-pre-wrap break-words', mine ? undefined : patientBodyTextClass)}>
      {message.body}
    </p>
  );
}
