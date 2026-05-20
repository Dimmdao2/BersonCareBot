/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { bindHlsProxyStreamToClientAbort } from "@/app-layer/media/hlsProxyClientAbortStream";

function controllableUpstream(): {
  stream: ReadableStream<Uint8Array>;
  enqueue: (chunk: Uint8Array) => void;
  close: () => void;
  cancelCount: () => number;
} {
  let cancelCalls = 0;
  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
    },
    cancel() {
      cancelCalls += 1;
    },
  });
  return {
    stream,
    enqueue: (chunk) => ctrl?.enqueue(chunk),
    close: () => ctrl?.close(),
    cancelCount: () => cancelCalls,
  };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out.push(value);
  }
  return out;
}

describe("bindHlsProxyStreamToClientAbort", () => {
  it("forwards upstream bytes when client stays connected", async () => {
    const upstream = controllableUpstream();
    const bound = bindHlsProxyStreamToClientAbort(upstream.stream);
    upstream.enqueue(new Uint8Array([1, 2]));
    upstream.close();

    const chunks = await readAll(bound);
    expect(chunks).toHaveLength(1);
    expect(Array.from(chunks[0]!)).toEqual([1, 2]);
    expect(upstream.cancelCount()).toBe(0);
  });

  it("cancels upstream when client AbortSignal fires mid-read", async () => {
    const upstream = controllableUpstream();
    const ac = new AbortController();
    const bound = bindHlsProxyStreamToClientAbort(upstream.stream, ac.signal);

    upstream.enqueue(new Uint8Array([9]));

    const reader = bound.getReader();
    await reader.read();
    ac.abort();

    await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
    expect(upstream.cancelCount()).toBeGreaterThanOrEqual(1);
  });

  it("delivers bytes when upstream closes before client abort", async () => {
    const upstream = controllableUpstream();
    const ac = new AbortController();
    const bound = bindHlsProxyStreamToClientAbort(upstream.stream, ac.signal);

    upstream.enqueue(new Uint8Array([7]));
    upstream.close();

    await expect(readAll(bound)).resolves.toEqual([new Uint8Array([7])]);
    ac.abort();
    expect(upstream.cancelCount()).toBe(0);
  });

  it("returns an immediately idle stream when signal is already aborted", async () => {
    const upstream = controllableUpstream();
    const ac = new AbortController();
    ac.abort();
    const bound = bindHlsProxyStreamToClientAbort(upstream.stream, ac.signal);

    await expect(readAll(bound)).resolves.toEqual([]);
    expect(upstream.cancelCount()).toBe(1);
  });
});
