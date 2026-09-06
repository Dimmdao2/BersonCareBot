'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
import { DoctorMediaPlaybackVideo } from '@/shared/ui/doctor/media/DoctorMediaPlaybackVideo';
import { DoctorCatalogMediaStaticThumb } from '@/shared/ui/doctor/media/DoctorCatalogMediaStaticThumb';
import { MediaThumb } from '@/shared/ui/doctor/media/MediaThumb';
import type { MediaPreviewUiModel } from '@/shared/ui/doctor/media/mediaPreviewUiModel';
import { cn } from '@/lib/utils';
import { useDiscussionMessageMediaPlayback } from '@/shared/ui/chat/useDiscussionMessageMediaPlayback';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';

/**
 * Тело сообщения обсуждения в кабинете ВРАЧА — зеркало patient-варианта на doctor-примитивах.
 *
 * Отдельный компонент, а не общий с пациентом: раньше doctor-панель импортировала patient-версию и
 * вместе с ней тянула в doctor-дерево patient-модалку, превью и плеер (AGENTS.md §17 — деревья UI
 * зон не пересекаются). Общей осталась только модель загрузки
 * {@link useDiscussionMessageMediaPlayback}; поведение просмотра медиа врача не менялось.
 */
export function DoctorProgramItemDiscussionMessageBody(props: {
  message: ProgramItemDiscussionMessage;
  textClassName?: string;
  trailingContent?: ReactNode;
}) {
  const { message, textClassName, trailingContent } = props;
  const [playerOpen, setPlayerOpen] = useState(false);
  const mediaId = message.mediaFileId;
  const { playback, failed: playbackFailed, isVideo } = useDiscussionMessageMediaPlayback(mediaId);

  if (mediaId) {
    /**
     * While the thumbnail is missing the bubble shows the stored file itself, but only once the
     * upload has been through the standard rendition (owner ruling 19.08); before that the file is
     * still the user's own bytes at full size and only the placeholder is shown.
     */
    const imagePreview: MediaPreviewUiModel = {
      id: mediaId,
      kind: 'image',
      url: `/api/media/${encodeURIComponent(mediaId)}`,
      previewStatus: playbackFailed ? 'failed' : (playback?.preview.status ?? 'pending'),
      previewSmUrl: playback?.preview.smUrl ?? null,
      previewMdUrl: playback?.preview.mdUrl ?? null,
      standardRendition: playback?.preview.standardRendition === true,
    };
    const videoThumbMedia:
      import('@/modules/recommendations/types').RecommendationMediaItem | null =
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
            if (
              playback &&
              (isVideo || imagePreview.previewSmUrl || imagePreview.standardRendition)
            )
              setPlayerOpen(true);
          }}
        >
          {isVideo ? (
            <DoctorCatalogMediaStaticThumb
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
              <DoctorMediaPlaybackVideo
                mediaId={mediaId}
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
    <p className={cn('whitespace-pre-wrap break-words', textClassName)}>
      {message.body}
      {trailingContent}
    </p>
  );
}
