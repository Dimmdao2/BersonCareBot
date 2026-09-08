'use client';

import { Play } from 'lucide-react';
import { useRef, useState } from 'react';
import type { RecommendationMediaItem } from '@/modules/recommendations/types';
import { parseApiMediaIdFromPlayableUrl } from '@/shared/lib/parseApiMediaIdFromPlayableUrl';
import { PatientCatalogMediaStaticThumb } from '@/shared/ui/patient/PatientCatalogMediaStaticThumb';
import { PatientModal } from '@/shared/ui/patient/PatientModal';
import { HostedVideoEmbed } from '@/shared/ui/patient/media/HostedVideoEmbed';
import { MediaThumb } from '@/shared/ui/patient/media/MediaThumb';
import { PatientMediaPlaybackVideo } from '@/shared/ui/patient/media/PatientMediaPlaybackVideo';
import { recommendationMediaItemToPreviewUi } from '@/shared/ui/patient/media/mediaPreviewUiModel';
import { useIsMobileViewport } from '@/shared/ui/patient/primitives/useIsMobileViewport';
import { patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import { cn } from '@/lib/utils';

function PatientProgramVideoPlayer(props: {
  media: RecommendationMediaItem;
  title: string;
  presentation: 'inline' | 'fullscreen';
}) {
  const { media, title, presentation } = props;
  const isFullscreen = presentation === 'fullscreen';

  if (media.mediaType === 'hosted_video') {
    return (
      <HostedVideoEmbed
        url={media.mediaUrl}
        title={title}
        className={
          isFullscreen
            ? 'h-full min-h-0 w-full rounded-none [aspect-ratio:auto]'
            : 'shrink-0 rounded-none'
        }
      />
    );
  }

  const mediaId = parseApiMediaIdFromPlayableUrl(media.mediaUrl);
  if (!mediaId) {
    return (
      <div
        className={cn(
          'relative flex w-full shrink-0 items-center justify-center bg-muted/30 px-3',
          isFullscreen ? 'h-full min-h-0' : 'aspect-video',
        )}
      >
        <p className={cn(patientMutedTextClass, 'text-center text-sm')}>
          Видео без привязки к медиатеке нельзя воспроизвести здесь.
        </p>
      </div>
    );
  }

  return (
    <PatientMediaPlaybackVideo
      mediaId={mediaId}
      title={title}
      initialPlayback={null}
      shellClassName={
        isFullscreen
          ? 'relative min-h-0 flex-1 w-full overflow-hidden rounded-none bg-black [aspect-ratio:auto]'
          : 'relative aspect-video w-full shrink-0 overflow-hidden bg-black'
      }
      presentation={presentation}
    />
  );
}

/**
 * На desktop видео остаётся частью отдельного экрана пункта программы. На mobile тот же media
 * открывается статичной кнопкой-превью в полноэкранном patient viewer — зеркале проверенного
 * doctor-сценария. Сам плеер монтируется только после открытия, поэтому скрытого второго потока нет.
 */
export function PatientProgramMediaBlock(props: {
  media: RecommendationMediaItem | null;
  title: string;
}) {
  const { media, title } = props;
  const isMobile = useIsMobileViewport();
  const [viewerOpen, setViewerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!media) return null;

  const isVideo = media.mediaType === 'video' || media.mediaType === 'hosted_video';

  if (isVideo && isMobile) {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          className="group relative block aspect-video w-full shrink-0 overflow-hidden bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--primary))]"
          onClick={() => setViewerOpen(true)}
          aria-label="Открыть видео на весь экран"
        >
          <PatientCatalogMediaStaticThumb
            media={media}
            frameClassName="h-full w-full"
            sizes="100vw"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-active:bg-black/30">
            <span className="flex size-14 items-center justify-center rounded-full border border-white/45 bg-black/45 text-white backdrop-blur-sm">
              <Play className="ml-0.5 size-6 fill-current" aria-hidden />
            </span>
          </span>
        </button>
        <PatientModal
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          title={title}
          presentation="fullscreen-media"
          returnFocusRef={triggerRef}
        >
          <PatientProgramVideoPlayer media={media} title={title} presentation="fullscreen" />
        </PatientModal>
      </>
    );
  }

  if (isVideo) {
    return <PatientProgramVideoPlayer media={media} title={title} presentation="inline" />;
  }

  return (
    <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-muted/20">
      <MediaThumb
        media={recommendationMediaItemToPreviewUi(media)}
        className="h-full w-full"
        imgClassName="h-full w-full object-contain"
        alt={title}
        lazy={false}
        sizes="100vw"
      />
    </div>
  );
}
