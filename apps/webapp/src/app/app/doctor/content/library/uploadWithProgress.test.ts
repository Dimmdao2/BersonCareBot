import { describe, expect, it, vi } from "vitest";
import { UploadRequestError, uploadWithProgress } from "./uploadWithProgress";

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

