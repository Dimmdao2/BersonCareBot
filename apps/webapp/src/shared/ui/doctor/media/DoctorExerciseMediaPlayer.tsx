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
}: {
  media: RecommendationMediaItem | null;
  title: string;
}) {
  if (!media || (media.mediaType !== 'video' && media.mediaType !== 'hosted_video')) {
    return (
      <DoctorCatalogMediaStaticThumb
        media={media}
        frameClassName="aspect-video w-full rounded-lg border border-border/60 bg-muted/15"
        sizes="(max-width: 639px) 100vw, 640px"
      />
    );
  }

  if (media.mediaType === 'hosted_video') {
    return <HostedVideoEmbed url={media.mediaUrl} title={title} />;
  }

  const mediaId = parseMediaFileIdFromAppUrl(media.mediaUrl);
  if (mediaId) {
    return (
      <DoctorMediaPlaybackVideo
        mediaId={mediaId}
        mp4Url={media.mediaUrl}
        title={title}
        initialPlayback={null}
        shellClassName="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      />
    );
  }

  return (
    <NoContextMenuVideo
      controls
      preload="metadata"
      className="aspect-video w-full rounded-lg bg-black object-contain"
    >
      <source src={media.mediaUrl} />
    </NoContextMenuVideo>
  );
}
