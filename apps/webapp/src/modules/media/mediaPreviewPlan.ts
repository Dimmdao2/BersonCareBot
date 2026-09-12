import { MAX_MEDIA_BYTES } from '@/modules/media/uploadAllowedMime';

/**
 * Что именно надо сделать с одной строкой `media_files`, у которой ещё нет превью, — и ничего
 * больше. Решение принимает вебапп, разбор байт делает `apps/media-worker`.
 *
 * Разделение появилось 10.09.2026 (план `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`, М7). До него
 * весь конвейер жил ВНУТРИ процесса Next.js: тот же процесс, что держит пулы к базе,
 * `SESSION_COOKIE_SECRET` и отвечает врачам и пациентам, запускал sharp/libvips, ImageMagick и
 * ffmpeg на файлах, которые ему прислали снаружи. Дефект памяти в любой из этих библиотек
 * приземлялся прямо на данные пациентов.
 *
 * Здесь остаётся ровно то, что НЕ трогает чужие байты: выбор ветки по mime и размеру, потолки,
 * классификация ошибки и backoff. Это чистые функции — их читает и тест, и контрольный шов.
 */

/** Больше пяти попыток строка не получает: дальше это `failed`, а не бесконечный retry. */
export const MAX_PREVIEW_ATTEMPTS = 5;
/** Не тянуть в память многосотмегабайтный исходник ради sharp (heap OOM). */
export const MAX_IMAGE_PREVIEW_BYTES = 50 * 1024 * 1024;
/** Потолок исходника для превью совпадает с потолком загрузки. */
export const MAX_PREVIEW_SOURCE_BYTES = MAX_MEDIA_BYTES;

/**
 * Обложки ролика на этом хостинге не будет никогда: ролик удалён/приватный, провайдер обложек не
 * отдаёт, либо он вообще не из тех, кого мы умеем спрашивать. Это `skipped` — «превью не
 * создаётся», ровно как у файла, который нечем сконвертировать, а не ошибка обработки.
 */
export const HOSTED_PREVIEW_UNAVAILABLE = 'hosted_video_preview_unavailable';
/** Временная причина (сеть, лимит провайдера, ещё не заведён сервисный токен VK). */
export const HOSTED_PREVIEW_RETRY = 'hosted_video_preview_retry';

/**
 * Отказы, после которых повторять бессмысленно: файл не станет другим. Строки — дословные
 * формулировки ffmpeg/sharp; воркер передаёт текст ошибки как есть, решение принимается здесь.
 */
const PERMANENT_ERROR_PATTERNS = [
  'compression format has not been built in',
  'Input buffer contains unsupported image format',
  'Invalid data found when processing input',
  'was killed with signal SIGSEGV',
  HOSTED_PREVIEW_UNAVAILABLE,
] as const;

export function isPermanentPreviewError(message: string): boolean {
  return PERMANENT_ERROR_PATTERNS.some((p) => message.includes(p));
}

export function backoffMinutesAfterFailure(attemptsAfterIncrement: number): number {
  const exp = Math.min(attemptsAfterIncrement, 20);
  return Math.min(1440, Math.pow(2, exp));
}

/** Причина, по которой строка не получает превью вовсе. Уезжает в лог, не пользователю. */
export type MediaPreviewSkipReason =
  | 'heic_too_large'
  | 'image_too_large'
  | 'video_too_large'
  | 'unsupported_mime';

export type MediaPreviewPlan =
  /** Обычная картинка: байты уже лежат у нас, sharp переупаковывает их в стандартный рендишн. */
  | { kind: 'image'; sourceKey: string }
  /**
   * HEIC/HEIF: sharp его на хосте деплоя не гарантирует, поэтому сначала ffmpeg (с запасным
   * ImageMagick) разбирает исходник в полноразмерный JPEG, и уже он идёт в стандартный рендишн.
   */
  | { kind: 'heic'; sourceKey: string }
  /** Обложка чужого ролика: байты приносит вебапп через шов, у воркера сети наружу нет. */
  | { kind: 'hosted_thumbnail' }
  /** Видео: кадр-постер + два эскиза из НАШЕГО кадра, исходник остаётся как есть. */
  | { kind: 'video_poster'; sourceKey: string }
  | { kind: 'skip'; reason: MediaPreviewSkipReason };

export type MediaPreviewPlanInput = {
  mimeType: string;
  sizeBytes: number;
  s3Key: string | null;
  usagePurpose: string | null;
  hostedVideoSourceUrl: string | null;
};

/**
 * Порядок веток дословно повторяет прежний `processMediaPreviewBatch` — в том числе то, что
 * проверка HEIC стоит ДО потолка обычной картинки: HEIC между 50 МБ и потолком загрузки идёт по
 * пути ffmpeg, а не отбрасывается как «слишком большая картинка».
 */
export function planMediaPreview(row: MediaPreviewPlanInput): MediaPreviewPlan {
  const storedKey = row.s3Key?.trim() ?? '';
  const hosted =
    row.usagePurpose === 'hosted_video_preview' &&
    storedKey.length === 0 &&
    (row.hostedVideoSourceUrl?.trim().length ?? 0) > 0;
  if (hosted) return { kind: 'hosted_thumbnail' };

  const mime = row.mimeType.toLowerCase();
  const sizeBytes = Number(row.sizeBytes) || 0;

  if (mime === 'image/heic' || mime === 'image/heif') {
    if (sizeBytes > MAX_PREVIEW_SOURCE_BYTES) return { kind: 'skip', reason: 'heic_too_large' };
    return { kind: 'heic', sourceKey: storedKey };
  }
  if (mime.startsWith('image/') && sizeBytes > MAX_IMAGE_PREVIEW_BYTES) {
    return { kind: 'skip', reason: 'image_too_large' };
  }
  if (mime.startsWith('video/') && sizeBytes > MAX_PREVIEW_SOURCE_BYTES) {
    return { kind: 'skip', reason: 'video_too_large' };
  }
  if (mime.startsWith('image/')) return { kind: 'image', sourceKey: storedKey };
  if (mime.startsWith('video/')) return { kind: 'video_poster', sourceKey: storedKey };
  return { kind: 'skip', reason: 'unsupported_mime' };
}
