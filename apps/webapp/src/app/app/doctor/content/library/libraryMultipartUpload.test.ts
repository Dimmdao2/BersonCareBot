/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { libraryMultipartUpload } from "./libraryMultipartUpload";

describe("libraryMultipartUpload", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("calls abort after part-url fails following successful init", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/media/multipart/init")) {
        return new Response(
          JSON.stringify({
            ok: true,
            sessionId: "00000000-0000-4000-8000-000000000099",
            partSizeBytes: 10,
            maxParts: 1,
            mediaId: "00000000-0000-4000-8000-000000000088",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/media/multipart/part-url")) {
        return new Response(JSON.stringify({ ok: false, error: "session_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/media/multipart/abort")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 500 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const ac = new AbortController();
    const file = new File([new Uint8Array(5)], "t.bin", { type: "application/octet-stream" });

    await expect(
      libraryMultipartUpload({
        file,
        folderId: null,
        signal: ac.signal,
        onProgress: () => {},
      }),
    ).rejects.toBeDefined();

    const abortCalls = fetchMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("/api/media/multipart/abort"),
    );
    expect(abortCalls.length).toBeGreaterThanOrEqual(1);
  });
});
