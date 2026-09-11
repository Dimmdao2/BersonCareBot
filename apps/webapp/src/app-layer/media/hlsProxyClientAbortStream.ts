/**
 * Bridges an upstream ReadableStream (S3 segment body) to an HTTP Response body.
 * Uses `pipeTo` + client `AbortSignal` so disconnect cancels upstream once without
 * ERR_INVALID_STATE double-close on the web stream controller.
 *
 * `onSettled` (VIDEO_DELIVERY_COST_AND_METERING 11.09.2026 correction): fires exactly once, after
 * the pipe stops moving bytes for any reason (clean finish, upstream error, or client disconnect),
 * with the number of bytes that actually passed through — never the promised `Content-Length`. A
 * live probe against real DEV S3 caught the previous call site recording the full `Content-Length`
 * before a single byte had streamed: an aborted download (0 B delivered) was counted as if the whole
 * segment went out, quietly pushing "watched-through" numbers toward 100% and hiding exactly the
 * signal the byte table exists to surface.
 */
export function bindHlsProxyStreamToClientAbort(
  upstream: ReadableStream<Uint8Array>,
  clientSignal?: AbortSignal | null,
  onSettled?: (bytesSent: number) => void,
): ReadableStream<Uint8Array> {
  if (clientSignal?.aborted) {
    void upstream.cancel(clientSignal.reason).catch(() => {});
    onSettled?.(0);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
  }

  let bytesSent = 0;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesSent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });

  void upstream
    .pipeTo(writable, {
      ...(clientSignal ? { signal: clientSignal } : {}),
    })
    .catch(() => {
      // Client abort, upstream error, or writable already closed — expected on disconnect.
    })
    .finally(() => {
      onSettled?.(bytesSent);
    });

  return readable;
}
