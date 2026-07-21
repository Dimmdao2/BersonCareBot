import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ExternalFetchAbortedError,
  ExternalFetchTimeoutError,
  fetchWithTimeout,
} from './externalFetch';

function hangingFetch(onRelease: () => void): typeof fetch {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener(
          'abort',
          () => {
            onRelease();
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchWithTimeout', () => {
  it('aborts and releases a hanging fetch when the finite timeout expires', async () => {
    vi.useFakeTimers();
    const released = vi.fn();
    const promise = fetchWithTimeout('https://provider.test/hang', undefined, {
      timeoutMs: 1_000,
      fetchImpl: hangingFetch(released),
    });
    const rejection = expect(promise).rejects.toMatchObject({
      name: 'ExternalFetchTimeoutError',
      code: 'external_fetch_timeout',
      timeoutMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(released).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves a non-timeout network error unchanged and clears its timer', async () => {
    vi.useFakeTimers();
    const networkError = new Error('provider_connection_reset');
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(networkError);

    await expect(
      fetchWithTimeout('https://provider.test/error', undefined, {
        timeoutMs: 1_000,
        fetchImpl,
      }),
    ).rejects.toBe(networkError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('classifies caller cancellation separately and removes the timeout', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const released = vi.fn();
    const promise = fetchWithTimeout(
      'https://provider.test/cancel',
      { signal: caller.signal },
      { timeoutMs: 1_000, fetchImpl: hangingFetch(released) },
    );
    const rejection = expect(promise).rejects.toBeInstanceOf(ExternalFetchAbortedError);

    caller.abort(new DOMException('caller cancelled', 'AbortError'));

    await rejection;
    expect(released).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('exports distinct timeout and caller-abort error types', () => {
    expect(new ExternalFetchTimeoutError(10)).not.toBeInstanceOf(ExternalFetchAbortedError);
  });
});
