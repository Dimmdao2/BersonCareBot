'use client';

import { useEffect, useState } from 'react';
import type { MediaPlaybackPayload } from '@/modules/media/playbackPayloadTypes';
import { DoctorMediaPlaybackVideo } from '@/shared/ui/doctor/media/DoctorMediaPlaybackVideo';
import { MediaThumb } from '@/shared/ui/doctor/media/MediaThumb';
import type { MediaPreviewUiModel } from '@/shared/ui/doctor/media/mediaPreviewUiModel';

export function DoctorProgramActionLogMediaPreview(props: { mediaFileId: string }) {
  const { mediaFileId } = props;
  const [playback, setPlayback] = useState<MediaPlaybackPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/media/${encodeURIComponent(mediaFileId)}/playback`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === 'object' && 'mediaId' in data) {
          setPlayback(data as MediaPlaybackPayload);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaFileId]);

  const isVideo = playback?.delivery === 'mp4' || playback?.delivery === 'hls';

  if (isVideo) {
    return (
      <div className="mt-1 max-w-xs">
        <DoctorMediaPlaybackVideo
          mediaId={mediaFileId}
          mp4Url={`/api/media/${encodeURIComponent(mediaFileId)}`}
          title="Видео пациента"
          initialPlayback={playback}
          shellClassName="relative aspect-video w-full max-w-xs overflow-hidden rounded-md bg-muted/30"
        />
      </div>
    );
  }

  if (failed) {
    return (
      <p className="mt-0.5 text-xs text-muted-foreground">
        <a
          href={`/api/media/${encodeURIComponent(mediaFileId)}`}
          className="underline"
          target="_blank"
          rel="noreferrer"
        >
          Медиафайл
        </a>
      </p>
    );
  }

  /**
   * Изображение — только через {@link MediaThumb}: он показывает файл лишь после перекодирования
   * (`standard_rendition_at`), а до него — заглушку «готовится». Раньше здесь стоял прямой
   * `<img src="/api/media/…">` с `onError`, то есть на экран шла исходная загрузка пациента,
   * а «не готово» и «не загрузилось» были одним и тем же состоянием.
   */
  const imagePreview: MediaPreviewUiModel = {
    id: mediaFileId,
    kind: 'image',
    url: `/api/media/${encodeURIComponent(mediaFileId)}`,
    previewStatus: playback?.preview.status ?? 'pending',
    previewSmUrl: playback?.preview.smUrl ?? null,
    previewMdUrl: playback?.preview.mdUrl ?? null,
    standardRendition: playback?.preview.standardRendition === true,
  };

  return (
    <span className="mt-1 block max-w-xs">
      <MediaThumb
        media={imagePreview}
        className="max-h-32 max-w-full rounded-md object-contain"
        imgClassName="max-h-32 max-w-full rounded-md object-contain"
        sizes="320px"
        alt=""
      />
    </span>
  );
}
