export const PAYMENT_PROVIDER_FETCH_TIMEOUT_MS = 15_000;
export const OAUTH_PROVIDER_FETCH_TIMEOUT_MS = 10_000;

export class ExternalFetchTimeoutError extends Error {
  readonly code = 'external_fetch_timeout';

  constructor(
    readonly timeoutMs: number,
    options?: ErrorOptions,
  ) {
    super(`External fetch timed out after ${timeoutMs}ms`, options);
    this.name = 'ExternalFetchTimeoutError';
  }
}

export class ExternalFetchAbortedError extends Error {
  readonly code = 'external_fetch_aborted';

  constructor(options?: ErrorOptions) {
    super('External fetch was aborted', options);
    this.name = 'ExternalFetchAbortedError';
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: {
    timeoutMs: number;
    fetchImpl?: typeof fetch;
  },
): Promise<Response> {
  const { timeoutMs, fetchImpl = globalThis.fetch } = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('fetch_timeout_must_be_positive');
  }

  const callerSignal = init?.signal ?? undefined;
  if (callerSignal?.aborted) {
    throw new ExternalFetchAbortedError({ cause: callerSignal.reason });
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = (): void => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('External fetch timed out', 'TimeoutError'));
  }, timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (timedOut) {
      throw new ExternalFetchTimeoutError(timeoutMs, { cause: error });
    }
    if (callerSignal?.aborted || (controller.signal.aborted && isAbortError(error))) {
      throw new ExternalFetchAbortedError({ cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}
