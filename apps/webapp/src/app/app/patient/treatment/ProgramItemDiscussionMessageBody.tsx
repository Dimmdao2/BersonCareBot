'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { PatientModal } from '@/shared/ui/patient/PatientModal';
import { PatientMediaPlaybackVideo } from '@/shared/ui/patient/media/PatientMediaPlaybackVideo';
import { PatientCatalogMediaStaticThumb } from '@/shared/ui/patient/PatientCatalogMediaStaticThumb';
import { MediaThumb } from '@/shared/ui/patient/media/MediaThumb';
import type { MediaPreviewUiModel } from '@/shared/ui/patient/media/mediaPreviewUiModel';
import { cn } from '@/lib/utils';
import { patientBodyTextClass } from '@/shared/ui/patient/patientVisual';
import { useDiscussionMessageMediaPlayback } from '@/shared/ui/chat/useDiscussionMessageMediaPlayback';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';

/**
 * Тело сообщения обсуждения в кабинете ПАЦИЕНТА.
 *
 * Медиа открывается полноэкранно поверх обсуждения (`PatientModal presentation="fullscreen-media"`),
 * а обсуждение под ним остаётся смонтированным — закрытие возвращает ровно в тот же тред.
 * Модель загрузки playback общая с кабинетом врача ({@link useDiscussionMessageMediaPlayback}),
 * сам UI — patient-примитивы, без импорта doctor-зоны (AGENTS.md §17).
 */
export function ProgramItemDiscussionMessageBody(props: {
  message: ProgramItemDiscussionMessage;
  mine: boolean;
  textClassName?: string;
  trailingContent?: ReactNode;
}) {
  const { message, mine, textClassName, trailingContent } = props;
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
    const videoThumbMedia: MediaPreviewUiModel | null =
      isVideo && playback?.posterUrl
        ? {
            id: mediaId,
            kind: 'video',
            url: playback.posterUrl,
            previewStatus: null,
            previewSmUrl: playback.posterUrl,
            previewMdUrl: playback.posterUrl,
            standardRendition: null,
          }
        : null;

    return (
      <>
        <button
          type="button"
          className="block max-w-full overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)]"
          onClick={() => {
            if (
              playback &&
              (isVideo || imagePreview.previewSmUrl || imagePreview.standardRendition)
            )
              setPlayerOpen(true);
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
        <PatientModal
          open={playerOpen}
          onClose={() => setPlayerOpen(false)}
          title={isVideo ? 'Видео' : 'Фото'}
          presentation="fullscreen-media"
        >
          {isVideo ? (
            <PatientMediaPlaybackVideo
              mediaId={mediaId}
              title="Видео"
              initialPlayback={playback}
              presentation="fullscreen"
            />
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center p-2">
              <MediaThumb
                media={imagePreview}
                className="max-h-full w-full object-contain"
                imgClassName="max-h-full w-full object-contain"
                sizes="100vw"
                lazy={false}
                alt=""
              />
            </div>
          )}
        </PatientModal>
      </>
    );
  }

  if (!message.body?.trim()) return null;

  return (
    <p
      className={cn(
        'whitespace-pre-wrap break-words',
        mine ? undefined : patientBodyTextClass,
        textClassName,
      )}
    >
      {message.body}
      {trailingContent}
    </p>
  );
}
