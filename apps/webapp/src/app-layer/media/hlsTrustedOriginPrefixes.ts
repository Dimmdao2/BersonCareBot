import { env } from '@/config/env';

/**
 * Trusted absolute URL prefixes for objects in our own private buckets (path-style +
 * virtual-hosted). Used to rewrite absolute URIs inside playlists to same-origin
 * `/api/media/{id}/hls/...`.
 *
 * Оба хранилища перечислены вместе, а не по одному на запрос: плейлист переписывается по
 * ключу `media/{id}/hls/`, и лишний доверенный префикс своего же бакета ничего не открывает —
 * зато отсутствующий оставил бы в плейлисте пациента прямую ссылку на хранилище.
 */
function prefixesFor(endpoint: string, bucket: string): string[] {
  const cleanEndpoint = endpoint.trim().replace(/\/+$/, '');
  const cleanBucket = bucket.trim();
  if (!cleanEndpoint || !cleanBucket) return [];
  const out: string[] = [`${cleanEndpoint}/${cleanBucket}/`];
  try {
    const u = new URL(cleanEndpoint);
    out.push(`${u.protocol}//${cleanBucket}.${u.host}/`);
  } catch {
    /* ignore malformed endpoint */
  }
  return out;
}

export function buildTrustedPrivateObjectUrlPrefixes(): string[] {
  const libraryEndpoint = env.S3_ENDPOINT ?? '';
  const out = prefixesFor(libraryEndpoint, env.S3_PRIVATE_BUCKET ?? '');
  if (env.PATIENT_S3_BUCKET) {
    out.push(...prefixesFor(env.PATIENT_S3_ENDPOINT || libraryEndpoint, env.PATIENT_S3_BUCKET));
  }
  return [...new Set(out)];
}
