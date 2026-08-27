import { expect, it, vi } from 'vitest';

import {
  resolveHostedVideoThumbnail,
  type HostedVideoThumbnailDeps,
} from './hostedVideoThumbnail';

const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const THUMBNAIL_URL = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';

function responseAt(url: string, body: BodyInit, init: ResponseInit): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

it('does not follow a provider redirect before validating its destination', async () => {
  let forbiddenOriginWasRequested = false;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://www.youtube.com/oembed')) {
      if (init?.redirect === 'manual') {
        return responseAt(url, '', {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        });
      }

      // This is what an automatic redirect does at the network boundary: the forbidden
      // destination has already received a request before Response.url can be inspected.
      forbiddenOriginWasRequested = true;
      return responseAt(
        'http://169.254.169.254/latest/meta-data/',
        JSON.stringify({ thumbnail_url: THUMBNAIL_URL }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return responseAt(THUMBNAIL_URL, new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  });
  const deps: HostedVideoThumbnailDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    vkServiceToken: async () => '',
  };

  const outcome = await resolveHostedVideoThumbnail(VIDEO_URL, deps);

  expect(forbiddenOriginWasRequested).toBe(false);
  expect(outcome.kind).toBe('terminal');
});
