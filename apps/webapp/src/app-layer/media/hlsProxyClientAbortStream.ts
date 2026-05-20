/**
 * Bridges an upstream ReadableStream (S3 segment body) to an HTTP Response body.
 * Uses `pipeTo` + client `AbortSignal` so disconnect cancels upstream once without
 * ERR_INVALID_STATE double-close on the web stream controller.
 */
export function bindHlsProxyStreamToClientAbort(
  upstream: ReadableStream<Uint8Array>,
  clientSignal?: AbortSignal | null,
): ReadableStream<Uint8Array> {
  if (clientSignal?.aborted) {
    void upstream.cancel(clientSignal.reason).catch(() => {});
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

  void upstream
    .pipeTo(writable, {
      ...(clientSignal ? { signal: clientSignal } : {}),
    })
    .catch(() => {
      // Client abort, upstream error, or writable already closed — expected on disconnect.
    });

  return readable;
}
