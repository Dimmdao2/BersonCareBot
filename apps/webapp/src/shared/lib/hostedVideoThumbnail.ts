/**
 * Обложка ролика с внешнего видеохостинга: получить у провайдера, проверить и скачать один раз.
 *
 * Владелец (`docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`, «Превью для видео по
 * ссылке»): «картинку скачиваем один раз и кладём в НАШЕ хранилище». Этот модуль — серверная
 * часть требования: он один знает, где у провайдера лежит обложка, и он единственный ходит за
 * ней в сеть. Ни один URL, полученный отсюда, не уходит в браузер: вызывающий
 * (`mediaPreviewWorker`) перекодирует байты нашим энкодером и кладёт в наш private-бакет.
 *
 * Живёт рядом с `hostingEmbedUrls.ts` намеренно: ссылка разбирается там, обложка достаётся
 * здесь, второго списка разрешённых хостов не существует. В UI не импортируется — сетевые
 * запросы и сервисный токен VK не должны попасть в клиентский бандл.
 *
 * Разведка 27.08 (живые запросы, `git show 48280f9e3`): YouTube отдаёт обложку публичным oEmbed
 * без ключа и отвечает HTTP 400 на удалённый/приватный ролик; VK `video.get` без сервисного
 * токена отвечает `error_code 5` («token required»), а страница ролика без сессии редиректит на
 * `login.vk.ru` — то есть скрейпинг вместо API не спасает.
 */
import { parseHostedVideoLink, type HostedVideoProvider } from '@/shared/lib/hostingEmbedUrls';
import { getConfigValue } from '@/modules/system-settings/configAdapter';

/** Ролик пропал/закрыт/провайдер обложек не отдаёт — идти за ней снова бессмысленно. */
export type HostedVideoThumbnailTerminal = { kind: 'terminal'; reason: string };
/** Сеть, лимит, 5xx, отсутствующий токен — повторить позже в пределах общего лимита попыток. */
export type HostedVideoThumbnailRetryable = { kind: 'retryable'; reason: string };

export type HostedVideoThumbnailOutcome =
  | { kind: 'ready'; bytes: Buffer; mimeType: string; thumbnailOrigin: string }
  | HostedVideoThumbnailRetryable
  | HostedVideoThumbnailTerminal;

export type HostedVideoThumbnailDeps = {
  /** Инъекция ради теста; в бою — глобальный `fetch`. */
  fetch: typeof globalThis.fetch;
  /** Сервисный токен VK API с правом `video`; отсутствие — retryable, не terminal. */
  vkServiceToken: () => Promise<string>;
};

/** Обложка — картинка, а не видеофайл: потолок держим много ниже общего медиа-лимита. */
export const MAX_HOSTED_THUMBNAIL_BYTES = 8 * 1024 * 1024;
const PROVIDER_API_TIMEOUT_MS = 10_000;
const THUMBNAIL_DOWNLOAD_TIMEOUT_MS = 20_000;

const ALLOWED_THUMBNAIL_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Куда провайдеру позволено отправить нас за картинкой. Проверяется и до запроса, и по
 * фактическому origin после редиректов: `thumbnail_url` из чужого JSON — это ввод, а не факт.
 */
const THUMBNAIL_HOST_SUFFIXES: Partial<Record<HostedVideoProvider, readonly string[]>> = {
  youtube: ['ytimg.com', 'youtube.com'],
  vk: ['userapi.com', 'vkuservideo.net', 'mycdn.me', 'vkvideo.ru', 'vk.com'],
};

function hostAllowed(rawUrl: string, provider: HostedVideoProvider): boolean {
  const suffixes = THUMBNAIL_HOST_SUFFIXES[provider];
  if (!suffixes) return false;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function terminal(reason: string): HostedVideoThumbnailTerminal {
  return { kind: 'terminal', reason };
}

function retryable(reason: string): HostedVideoThumbnailRetryable {
  return { kind: 'retryable', reason };
}

/** HTTP-статус провайдера в разряд ошибки: 4xx — постоянная, 429/5xx — временная. */
function classifyProviderStatus(status: number): HostedVideoThumbnailTerminal | HostedVideoThumbnailRetryable {
  if (status === 429 || status >= 500) return retryable(`provider_status_${status}`);
  return terminal(`provider_status_${status}`);
}

async function fetchWithTimeout(
  deps: HostedVideoThumbnailDeps,
  url: string,
  timeoutMs: number,
): Promise<{ ok: true; response: Response } | { ok: false; outcome: HostedVideoThumbnailRetryable }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await deps.fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: '*/*' },
    });
    return { ok: true, response };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    return {
      ok: false,
      outcome: retryable(name === 'AbortError' ? 'provider_timeout' : 'provider_network_error'),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Скачивание с потолком по байтам: тело читается кусками и обрывается на превышении, а не
 * загружается целиком с последующей проверкой длины. `content-length` провайдера — подсказка,
 * а не гарантия, поэтому считаем сами.
 */
async function readBoundedBody(
  response: Response,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; outcome: HostedVideoThumbnailTerminal }> {
  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > MAX_HOSTED_THUMBNAIL_BYTES) {
    return { ok: false, outcome: terminal('thumbnail_too_large') };
  }
  if (!response.body) {
    return { ok: false, outcome: terminal('thumbnail_empty_body') };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_HOSTED_THUMBNAIL_BYTES) {
      await reader.cancel().catch(() => {});
      return { ok: false, outcome: terminal('thumbnail_too_large') };
    }
    chunks.push(value);
  }
  if (total === 0) {
    return { ok: false, outcome: terminal('thumbnail_empty_body') };
  }
  return { ok: true, bytes: Buffer.concat(chunks.map((c) => Buffer.from(c)), total) };
}

/** Общий хвост обоих провайдеров: скачать проверенный URL обложки и вернуть байты. */
async function downloadThumbnail(
  deps: HostedVideoThumbnailDeps,
  thumbnailUrl: string,
  provider: HostedVideoProvider,
): Promise<HostedVideoThumbnailOutcome> {
  if (!hostAllowed(thumbnailUrl, provider)) {
    return terminal('thumbnail_origin_rejected');
  }
  const got = await fetchWithTimeout(deps, thumbnailUrl, THUMBNAIL_DOWNLOAD_TIMEOUT_MS);
  if (!got.ok) return got.outcome;
  const { response } = got;
  if (!response.ok) return classifyProviderStatus(response.status);

  /* Редирект мог увести на любой хост — проверяем, где мы оказались, а не куда собирались. */
  const finalUrl = response.url?.trim() ? response.url : thumbnailUrl;
  if (!hostAllowed(finalUrl, provider)) {
    return terminal('thumbnail_redirect_origin_rejected');
  }

  const mimeType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!ALLOWED_THUMBNAIL_MIME.has(mimeType)) {
    return terminal(`thumbnail_mime_rejected_${mimeType || 'absent'}`);
  }

  const body = await readBoundedBody(response);
  if (!body.ok) return body.outcome;
  return {
    kind: 'ready',
    bytes: body.bytes,
    mimeType,
    thumbnailOrigin: new URL(finalUrl).origin,
  };
}

/** YouTube: публичный oEmbed, ключ не нужен; 4xx = ролика нет или он закрыт. */
async function resolveYoutube(
  deps: HostedVideoThumbnailDeps,
  canonicalUrl: string,
): Promise<HostedVideoThumbnailOutcome> {
  const api = new URL('https://www.youtube.com/oembed');
  api.searchParams.set('url', canonicalUrl);
  api.searchParams.set('format', 'json');

  const got = await fetchWithTimeout(deps, api.toString(), PROVIDER_API_TIMEOUT_MS);
  if (!got.ok) return got.outcome;
  if (!got.response.ok) return classifyProviderStatus(got.response.status);

  let payload: { thumbnail_url?: unknown };
  try {
    payload = (await got.response.json()) as { thumbnail_url?: unknown };
  } catch {
    return retryable('provider_bad_json');
  }
  const thumbnailUrl =
    typeof payload.thumbnail_url === 'string' ? payload.thumbnail_url.trim() : '';
  if (!thumbnailUrl) return terminal('provider_has_no_thumbnail');
  return downloadThumbnail(deps, thumbnailUrl, 'youtube');
}

type VkImage = { url?: unknown; width?: unknown; height?: unknown };

/** Самая крупная из отданных VK обложек — её и перекодируем под наши размеры. */
function largestVkImageUrl(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  let best: { url: string; area: number } | null = null;
  for (const raw of images as VkImage[]) {
    if (!raw || typeof raw.url !== 'string') continue;
    const width = typeof raw.width === 'number' ? raw.width : 0;
    const height = typeof raw.height === 'number' ? raw.height : 0;
    const area = width * height;
    if (!best || area > best.area) best = { url: raw.url, area };
  }
  return best?.url ?? null;
}

/**
 * VK: только официальный `video.get` с сервисным токеном.
 *
 * `error_code 5` — токен не выдан или протух: это состояние окружения, а не свойство ролика,
 * поэтому retryable с громким сообщением; общий лимит попыток воркера всё равно доведёт строку
 * до `failed`, вечного `pending` не будет. `15/17/200/203/204` — доступа к ролику нет, это про
 * сам ролик и это terminal. `6` — слишком часто, ждём.
 */
async function resolveVk(
  deps: HostedVideoThumbnailDeps,
  videoRef: string,
): Promise<HostedVideoThumbnailOutcome> {
  let token: string;
  try {
    token = (await deps.vkServiceToken()).trim();
  } catch {
    token = '';
  }
  if (!token) {
    return retryable('vk_video_service_token_missing');
  }

  const api = new URL('https://api.vk.com/method/video.get');
  api.searchParams.set('videos', videoRef);
  api.searchParams.set('v', '5.199');
  api.searchParams.set('access_token', token);

  const got = await fetchWithTimeout(deps, api.toString(), PROVIDER_API_TIMEOUT_MS);
  if (!got.ok) return got.outcome;
  if (!got.response.ok) return classifyProviderStatus(got.response.status);

  let payload: { response?: { items?: unknown }; error?: { error_code?: unknown } };
  try {
    payload = (await got.response.json()) as typeof payload;
  } catch {
    return retryable('provider_bad_json');
  }

  const errorCode = payload.error?.error_code;
  if (typeof errorCode === 'number') {
    if (errorCode === 5) return retryable('vk_video_service_token_rejected');
    if (errorCode === 6 || errorCode === 1 || errorCode === 10) {
      return retryable(`vk_error_${errorCode}`);
    }
    return terminal(`vk_error_${errorCode}`);
  }

  const items = payload.response?.items;
  const first = Array.isArray(items) ? (items[0] as { image?: unknown } | undefined) : undefined;
  if (!first) return terminal('vk_video_unavailable');

  const thumbnailUrl = largestVkImageUrl(first.image);
  if (!thumbnailUrl) return terminal('provider_has_no_thumbnail');
  return downloadThumbnail(deps, thumbnailUrl, 'vk');
}

export function defaultHostedVideoThumbnailDeps(): HostedVideoThumbnailDeps {
  return {
    fetch: (...args) => globalThis.fetch(...args),
    vkServiceToken: () => getConfigValue('vk_video_service_token'),
  };
}

/**
 * Единственная дверь «достать обложку ролика по нашей канонической ссылке».
 *
 * Возвращает байты, а не URL: наружу внешний адрес не отдаётся никогда. Провайдер, которого мы
 * не умеем спрашивать (RuTube, Vimeo), — `terminal`, то есть «обложки не будет», а не ошибка.
 */
export async function resolveHostedVideoThumbnail(
  canonicalUrl: string,
  deps: HostedVideoThumbnailDeps = defaultHostedVideoThumbnailDeps(),
): Promise<HostedVideoThumbnailOutcome> {
  const link = parseHostedVideoLink(canonicalUrl);
  if (!link) return terminal('not_a_hosted_video_link');
  if (link.provider === 'youtube') return resolveYoutube(deps, link.canonicalUrl);
  if (link.provider === 'vk') return resolveVk(deps, link.videoRef);
  return terminal(`provider_unsupported_${link.provider}`);
}
