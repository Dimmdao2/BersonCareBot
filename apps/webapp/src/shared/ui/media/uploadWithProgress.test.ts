/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { putPartWithProgress, UploadRequestError, uploadWithProgress } from "./uploadWithProgress";

type ProgressCb = ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;

class MockXhr {
  static nextStatus = 200;
  static nextResponseText = "{}";

  upload: { onprogress: ProgressCb } = { onprogress: null };
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  status = 0;
  responseText = "";
  withCredentials = false;

  open(_method: string, _url: string) {
    // no-op
  }

  send(_body: FormData) {
    this.status = MockXhr.nextStatus;
    this.responseText = MockXhr.nextResponseText;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 100 });
    this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    this.onload?.();
  }
}

describe("uploadWithProgress", () => {
  it("reports progress and resolves parsed json", async () => {
    const original = globalThis.XMLHttpRequest;
    const progress = vi.fn();
    MockXhr.nextStatus = 200;
    MockXhr.nextResponseText = JSON.stringify({ ok: true });
    // @ts-expect-error test override
    globalThis.XMLHttpRequest = MockXhr;

    const result = await uploadWithProgress<{ ok: boolean }>({
      url: "/api/media/upload",
      formData: new FormData(),
      onProgress: (loaded, total) => progress(loaded, total),
    });

    expect(result.ok).toBe(true);
    expect(progress).toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith(100, 100);
    globalThis.XMLHttpRequest = original;
  });

  it("throws UploadRequestError on non-2xx", async () => {
    const original = globalThis.XMLHttpRequest;
    MockXhr.nextStatus = 415;
    MockXhr.nextResponseText = JSON.stringify({ error: "mime_not_allowed" });
    // @ts-expect-error test override
    globalThis.XMLHttpRequest = MockXhr;

    await expect(
      uploadWithProgress<{ ok: boolean }>({
        url: "/api/media/upload",
        formData: new FormData(),
      }),
    ).rejects.toBeInstanceOf(UploadRequestError);

    globalThis.XMLHttpRequest = original;
  });
});

class MockPutPartXhr {
  static nextStatus = 200;
  static nextEtag: string | null = '"abc123"';
  static nextResponseText = "";

  upload: { onprogress: ProgressCb } = { onprogress: null };
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  status = 0;
  responseText = "";
  withCredentials = false;

  open(_method: string, _url: string) {
    // no-op
  }

  setRequestHeader(_name: string, _value: string) {
    // multipart parts must not set Content-Type — still no-op if called
  }

  getResponseHeader(name: string): string | null {
    if (name.toLowerCase() === "etag") return MockPutPartXhr.nextEtag;
    return null;
  }

  send(_body: Blob) {
    this.status = MockPutPartXhr.nextStatus;
    this.responseText = MockPutPartXhr.nextResponseText;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    this.onload?.();
  }

  abort() {
    this.onerror?.();
  }
}

describe("putPartWithProgress", () => {
  it("resolves with ETag on 2xx", async () => {
    const original = globalThis.XMLHttpRequest;
    MockPutPartXhr.nextStatus = 200;
    MockPutPartXhr.nextEtag = '"part-etag"';
    // @ts-expect-error test override
    globalThis.XMLHttpRequest = MockPutPartXhr;

    const progress = vi.fn();
    const etag = await putPartWithProgress({
      url: "https://minio.example/bucket/key?partNumber=1",
      body: new Blob([new Uint8Array([1, 2, 3])]),
      onProgress: (l, t) => progress(l, t),
    });

    expect(etag).toBe('"part-etag"');
    expect(progress).toHaveBeenLastCalledWith(100, 100);
    globalThis.XMLHttpRequest = original;
  });

  it("rejects with missing_etag when ETag header absent", async () => {
    const original = globalThis.XMLHttpRequest;
    MockPutPartXhr.nextStatus = 200;
    MockPutPartXhr.nextEtag = null;
    // @ts-expect-error test override
    globalThis.XMLHttpRequest = MockPutPartXhr;

    await expect(
      putPartWithProgress({
        url: "https://minio.example/upload",
        body: new Blob(),
      }),
    ).rejects.toMatchObject({ data: { error: "missing_etag" } });

    globalThis.XMLHttpRequest = original;
  });

  it("rejects when already aborted", async () => {
    const ac = new AbortController();
    ac.abort();

    await expect(
      putPartWithProgress({
        url: "https://minio.example/upload",
        body: new Blob(),
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ data: { error: "aborted" } });
  });

  it("rejects on non-2xx status", async () => {
    const original = globalThis.XMLHttpRequest;
    MockPutPartXhr.nextStatus = 403;
    MockPutPartXhr.nextEtag = '"x"';
    MockPutPartXhr.nextResponseText = "denied";
    // @ts-expect-error test override
    globalThis.XMLHttpRequest = MockPutPartXhr;

    await expect(
      putPartWithProgress({
        url: "https://minio.example/upload",
        body: new Blob(),
      }),
    ).rejects.toMatchObject({ status: 403 });

    globalThis.XMLHttpRequest = original;
  });
});
