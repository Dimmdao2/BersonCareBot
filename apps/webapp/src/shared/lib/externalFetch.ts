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

export async function fetchWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: {
    timeoutMs: number;
    fetchImpl?: typeof fetch;
  },
  consumeResponse: (response: Response) => Promise<T>,
): Promise<T> {
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
  let rejectTermination: (reason: Error) => void = () => undefined;
  const termination = new Promise<never>((_resolve, reject) => {
    rejectTermination = reject;
  });
  const abortFromCaller = (): void => {
    const error = new ExternalFetchAbortedError({ cause: callerSignal?.reason });
    rejectTermination(error);
    controller.abort(callerSignal?.reason);
  };
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    const error = new ExternalFetchTimeoutError(timeoutMs);
    rejectTermination(error);
    controller.abort(error);
  }, timeoutMs);

  try {
    const fetchAndConsume = fetchImpl(input, {
      ...init,
      signal: controller.signal,
    }).then(consumeResponse);
    return await Promise.race([fetchAndConsume, termination]);
  } catch (error: unknown) {
    if (error instanceof ExternalFetchTimeoutError || error instanceof ExternalFetchAbortedError) {
      throw error;
    }
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
