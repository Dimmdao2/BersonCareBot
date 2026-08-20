import type { MediaRecord } from './types';

export type VideoAttachmentPurpose = 'exercise' | 'cms';

export const VIDEO_DURATION_LIMIT_SECONDS: Readonly<Record<VideoAttachmentPurpose, number>> = {
  exercise: 10 * 60,
  cms: 20 * 60,
};

export type VideoAttachmentDurationResult =
  | { ok: true }
  | { ok: false; code: 'video_duration_pending' | 'video_duration_limit_exceeded'; error: string };

/**
 * The single attachment gate for file-library videos. The duration comes from the
 * media worker probe; an unprobed video is deliberately not attachable yet.
 */
export function validateVideoAttachmentDuration(
  purpose: VideoAttachmentPurpose,
  media: MediaRecord | null,
): VideoAttachmentDurationResult {
  if (!media || media.kind !== 'video') return { ok: true };

  const limitSeconds = VIDEO_DURATION_LIMIT_SECONDS[purpose];
  const limitMinutes = limitSeconds / 60;
  const label = purpose === 'exercise' ? 'упражнения' : 'CMS';

  if (media.videoDurationSeconds == null) {
    return {
      ok: false,
      code: 'video_duration_pending',
      error: `Видео для ${label} ещё обрабатывается. Дождитесь определения длительности и повторите сохранение.`,
    };
  }

  if (media.videoDurationSeconds > limitSeconds) {
    return {
      ok: false,
      code: 'video_duration_limit_exceeded',
      error:
        purpose === 'exercise'
          ? `Файл для упражнения не может быть длиннее ${limitMinutes} минут. Используйте ссылку YouTube, RuTube, VK Видео или Vimeo.`
          : `Файл CMS не может быть длиннее ${limitMinutes} минут. Используйте ссылку YouTube, RuTube, VK Видео или Vimeo.`,
    };
  }

  return { ok: true };
}
