import { describe, expect, it, vi } from 'vitest';
import { createHttpMediaWorkerControl, MediaWorkerControlError } from './control.js';

function client(fetchImpl: typeof fetch, timeoutMs = 100) {
  return createHttpMediaWorkerControl({
    baseUrl: 'http://127.0.0.1:5200',
    secret: 'private-control-secret',
    timeoutMs,
    fetchImpl,
  });
}

describe('HTTP media-worker control client', () => {
  it.each([401, 409, 500])('fails closed on HTTP %s without exposing its URL or secret', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ ok: false, error: 'closed' }),
      { status, headers: { 'content-type': 'application/json' } },
    ));

    const promise = client(fetchImpl).ready();

    await expect(promise).rejects.toBeInstanceOf(MediaWorkerControlError);
    await expect(promise).rejects.not.toThrow(/private-control-secret|127\.0\.0\.1/);
  });

  it('fails closed when a successful response is not JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('not-json', { status: 200 }));

    await expect(client(fetchImpl).ready()).rejects.toThrow('media control request failed: HTTP 200');
  });

  it('fails closed on a network error', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('network unavailable');
    });

    await expect(client(fetchImpl).ready()).rejects.toThrow('media control request failed');
  });

  it('aborts a control request after the configured bounded timeout', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
        once: true,
      });
    }));

    await expect(client(fetchImpl, 1).ready()).rejects.toThrow('media control request failed');
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
