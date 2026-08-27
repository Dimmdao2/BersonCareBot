import { describe, expect, it, vi } from 'vitest';

import {
  MAX_HOSTED_THUMBNAIL_BYTES,
  resolveHostedVideoThumbnail,
  type HostedVideoThumbnailDeps,
} from './hostedVideoThumbnail';

/**
 * Владелец: «картинку скачиваем один раз и кладём в НАШЕ хранилище». Отсюда два требования, и
 * оба проверяются здесь поведением, а не текстом кода:
 *   1. байты обложки мы действительно получаем — и только с адреса, который сами разрешили;
 *   2. отказ провайдера правильно разложен на «больше не пытаться» (ролика нет / хост чужой) и
 *      «повторить позже» (сеть, лимит, ещё не заведён токен) — иначе строка либо крутится вечно,
 *      либо сдаётся на первом же сетевом чихе.
 */

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VK_URL = 'https://vkvideo.ru/video-22822305_456239017';
const YT_THUMB = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';

function imageResponse(
  body: Uint8Array,
  init: { url?: string; contentType?: string; contentLength?: string; status?: number } = {},
): Response {
  const headers = new Headers();
  headers.set('content-type', init.contentType ?? 'image/jpeg');
  if (init.contentLength) headers.set('content-length', init.contentLength);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    },
  });
  const response = new Response(stream, { status: init.status ?? 200, headers });
  Object.defineProperty(response, 'url', { value: init.url ?? YT_THUMB });
  return response;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deps(over: Partial<HostedVideoThumbnailDeps> = {}): HostedVideoThumbnailDeps {
  return {
    fetch: vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch,
    vkServiceToken: async () => 'vk-service-token',
    ...over,
  };
}

describe('обложка ролика с внешнего хостинга', () => {
  describe('YouTube', () => {
    it('берёт обложку из публичного oEmbed и отдаёт байты, а не ссылку', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('https://www.youtube.com/oembed')) {
          return jsonResponse({ thumbnail_url: YT_THUMB });
        }
        return imageResponse(bytes);
      });

      const out = await resolveHostedVideoThumbnail(
        YOUTUBE_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );

      expect(out.kind).toBe('ready');
      if (out.kind !== 'ready') return;
      expect([...out.bytes]).toEqual([1, 2, 3, 4]);
      expect(out.mimeType).toBe('image/jpeg');
      /* Ключ не нужен: oEmbed публичный (замер 27.08). */
      const oembedCall = String(fetchMock.mock.calls[0]![0]);
      expect(oembedCall).not.toContain('access_token');
    });

    it('удалённый или приватный ролик — terminal, а не бесконечные повторы', async () => {
      const fetchMock = vi.fn(async () => new Response(null, { status: 400 }));
      const out = await resolveHostedVideoThumbnail(
        YOUTUBE_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );
      expect(out).toEqual({ kind: 'terminal', reason: 'provider_status_400' });
    });

    it.each([429, 500, 503])('временный отказ провайдера (%i) — retryable', async (status) => {
      const fetchMock = vi.fn(async () => new Response(null, { status }));
      const out = await resolveHostedVideoThumbnail(
        YOUTUBE_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );
      expect(out.kind).toBe('retryable');
    });

    it('обрыв сети — retryable', async () => {
      const fetchMock = vi.fn(async () => {
        throw new TypeError('fetch failed');
      });
      const out = await resolveHostedVideoThumbnail(
        YOUTUBE_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );
      expect(out).toEqual({ kind: 'retryable', reason: 'provider_network_error' });
    });

    it('таймаут — retryable, а не молчаливое зависание', async () => {
      const fetchMock = vi.fn(async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      });
      const out = await resolveHostedVideoThumbnail(
        YOUTUBE_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );
      expect(out).toEqual({ kind: 'retryable', reason: 'provider_timeout' });
    });

    it('не ходит по адресу картинки на посторонний хост, даже если его назвал сам провайдер', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith('https://www.youtube.com/oembed')) {
          return jsonResponse({ thumbnail_url: 'https://evil.example/pwn.jpg' });
        }
        throw new Error('этот запрос не должен был случиться');
      });

      const out = await resolveHostedVideoThumbnail(
        YOUTUBE_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );

      expect(out).toEqual({ kind: 'terminal', reason: 'thumbnail_origin_rejected' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('редирект, уведший на чужой origin, отбрасывается по фактическому адресу ответа', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith('https://www.youtube.com/oembed')) {
          return jsonResponse({ thumbnail_url: YT_THUMB });
        }
        return imageResponse(new Uint8Array([9]), { url: 'https://evil.example/pwn.jpg' });
      });

      const out = await resolveHostedVideoThumbnail(
        YOUTUBE_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );

      expect(out).toEqual({ kind: 'terminal', reason: 'thumbnail_redirect_origin_rejected' });
    });

    it('не картинка по MIME — terminal', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith('https://www.youtube.com/oembed')) {
          return jsonResponse({ thumbnail_url: YT_THUMB });
        }
        return imageResponse(new Uint8Array([9]), { contentType: 'text/html' });
      });

      const out = await resolveHostedVideoThumbnail(
        YOUTUBE_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );

      expect(out.kind).toBe('terminal');
      if (out.kind !== 'terminal') return;
      expect(out.reason).toContain('thumbnail_mime_rejected');
    });

    it('слишком большой файл не читается целиком — обрывается по потолку', async () => {
      const oversized = new Uint8Array(MAX_HOSTED_THUMBNAIL_BYTES + 1);
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith('https://www.youtube.com/oembed')) {
          return jsonResponse({ thumbnail_url: YT_THUMB });
        }
        return imageResponse(oversized);
      });

      const out = await resolveHostedVideoThumbnail(
        YOUTUBE_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );

      expect(out).toEqual({ kind: 'terminal', reason: 'thumbnail_too_large' });
    });

    it('заявленный content-length выше потолка отсекается до чтения тела', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith('https://www.youtube.com/oembed')) {
          return jsonResponse({ thumbnail_url: YT_THUMB });
        }
        return imageResponse(new Uint8Array([1]), {
          contentLength: String(MAX_HOSTED_THUMBNAIL_BYTES + 1),
        });
      });

      const out = await resolveHostedVideoThumbnail(
        YOUTUBE_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );

      expect(out).toEqual({ kind: 'terminal', reason: 'thumbnail_too_large' });
    });
  });

  describe('VK', () => {
    it('без сервисного токена не выдумывает обходной путь: retryable, к провайдеру не ходит', async () => {
      const fetchMock = vi.fn(async () => {
        throw new Error('в сеть ходить нечем');
      });

      const out = await resolveHostedVideoThumbnail(
        VK_URL,
        deps({
          fetch: fetchMock as unknown as typeof fetch,
          vkServiceToken: async () => '',
        }),
      );

      expect(out).toEqual({ kind: 'retryable', reason: 'vk_video_service_token_missing' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('токен не заведён в этом окружении вовсе — тоже retryable, не падение', async () => {
      const out = await resolveHostedVideoThumbnail(
        VK_URL,
        deps({
          vkServiceToken: async () => {
            throw new Error('runtime_setting_unavailable');
          },
        }),
      );
      expect(out).toEqual({ kind: 'retryable', reason: 'vk_video_service_token_missing' });
    });

    it('берёт самую крупную обложку из video.get и скачивает её', async () => {
      const bytes = new Uint8Array([7, 7, 7]);
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('https://api.vk.com/method/video.get')) {
          return jsonResponse({
            response: {
              items: [
                {
                  image: [
                    { url: 'https://sun1.userapi.com/small.jpg', width: 160, height: 120 },
                    { url: 'https://sun1.userapi.com/big.jpg', width: 1280, height: 720 },
                  ],
                },
              ],
            },
          });
        }
        return imageResponse(bytes, { url: 'https://sun1.userapi.com/big.jpg' });
      });

      const out = await resolveHostedVideoThumbnail(
        VK_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );

      expect(out.kind).toBe('ready');
      expect(String(fetchMock.mock.calls[1]![0])).toBe('https://sun1.userapi.com/big.jpg');
    });

    it('отклонённый токен — retryable (это про окружение), а не terminal', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ error: { error_code: 5 } }));
      const out = await resolveHostedVideoThumbnail(
        VK_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );
      expect(out).toEqual({ kind: 'retryable', reason: 'vk_video_service_token_rejected' });
    });

    it('нет доступа к ролику — terminal (это про сам ролик)', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ error: { error_code: 200 } }));
      const out = await resolveHostedVideoThumbnail(
        VK_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );
      expect(out).toEqual({ kind: 'terminal', reason: 'vk_error_200' });
    });

    it('слишком частые запросы — retryable', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ error: { error_code: 6 } }));
      const out = await resolveHostedVideoThumbnail(
        VK_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );
      expect(out).toEqual({ kind: 'retryable', reason: 'vk_error_6' });
    });

    it('ролик удалён — пустой ответ становится terminal', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ response: { items: [] } }));
      const out = await resolveHostedVideoThumbnail(
        VK_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );
      expect(out).toEqual({ kind: 'terminal', reason: 'vk_video_unavailable' });
    });

    it('картинка VK принимается только с их же CDN', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith('https://api.vk.com/method/video.get')) {
          return jsonResponse({
            response: { items: [{ image: [{ url: 'https://evil.example/x.jpg' }] }] },
          });
        }
        throw new Error('этот запрос не должен был случиться');
      });

      const out = await resolveHostedVideoThumbnail(
        VK_URL,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );

      expect(out).toEqual({ kind: 'terminal', reason: 'thumbnail_origin_rejected' });
    });
  });

  describe('остальные ссылки', () => {
    it.each([
      ['https://rutube.ru/video/aabbccddeeff00112233445566778899/', 'rutube'],
      ['https://vimeo.com/76979871', 'vimeo'],
    ])('провайдера, которого мы не спрашиваем (%s), закрывает terminal', async (url, provider) => {
      const fetchMock = vi.fn(async () => {
        throw new Error('в сеть ходить не за чем');
      });
      const out = await resolveHostedVideoThumbnail(
        url,
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );
      expect(out).toEqual({ kind: 'terminal', reason: `provider_unsupported_${provider}` });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('строка, которая вообще не ссылка на разрешённый хост, в сеть не уходит', async () => {
      const fetchMock = vi.fn(async () => {
        throw new Error('в сеть ходить не за чем');
      });
      const out = await resolveHostedVideoThumbnail(
        'https://evil.example/video/1',
        deps({ fetch: fetchMock as unknown as typeof fetch }),
      );
      expect(out).toEqual({ kind: 'terminal', reason: 'not_a_hosted_video_link' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
