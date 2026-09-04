'use client';

import type { RecommendationMediaItem } from '@/modules/recommendations/types';
import { parseMediaFileIdFromAppUrl } from '@/shared/lib/mediaPreviewUrls';
import { DoctorCatalogMediaStaticThumb } from './DoctorCatalogMediaStaticThumb';
import { DoctorMediaPlaybackVideo } from './DoctorMediaPlaybackVideo';
import { HostedVideoEmbed } from './HostedVideoEmbed';
import { NoContextMenuVideo } from './NoContextMenuVideo';

export function DoctorExerciseMediaPlayer({
  media,
  title,
  presentation = 'inline',
}: {
  media: RecommendationMediaItem | null;
  title: string;
  presentation?: 'inline' | 'fullscreen';
}) {
  const isFullscreen = presentation === 'fullscreen';

  if (!media || (media.mediaType !== 'video' && media.mediaType !== 'hosted_video')) {
    return (
      <DoctorCatalogMediaStaticThumb
        media={media}
        frameClassName={
          isFullscreen
            ? 'h-full w-full rounded-none border-0 bg-black [aspect-ratio:auto]'
            : 'aspect-video w-full rounded-lg border border-border/60 bg-muted/15'
        }
        sizes="(max-width: 639px) 100vw, 640px"
      />
    );
  }

  if (media.mediaType === 'hosted_video') {
    return (
      <HostedVideoEmbed
        url={media.mediaUrl}
        title={title}
        className={
          isFullscreen ? 'h-full min-h-0 w-full rounded-none [aspect-ratio:auto]' : undefined
        }
      />
    );
  }

  const mediaId = parseMediaFileIdFromAppUrl(media.mediaUrl);
  if (mediaId) {
    return (
      <DoctorMediaPlaybackVideo
        mediaId={mediaId}
        title={title}
        initialPlayback={null}
        shellClassName={
          isFullscreen
            ? 'relative min-h-0 flex-1 w-full overflow-hidden rounded-none bg-black [aspect-ratio:auto]'
            : 'relative aspect-video w-full overflow-hidden rounded-lg bg-black'
        }
        presentation={presentation}
      />
    );
  }

  return (
    <NoContextMenuVideo
      controls
      preload="metadata"
      className={
        isFullscreen
          ? 'h-full w-full rounded-none bg-black object-contain'
          : 'aspect-video w-full rounded-lg bg-black object-contain'
      }
    >
      <source src={media.mediaUrl} />
    </NoContextMenuVideo>
  );
}
