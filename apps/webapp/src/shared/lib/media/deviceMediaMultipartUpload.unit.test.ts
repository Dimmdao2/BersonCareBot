/**
 * Acceptance for the ONE shared multipart client lifecycle (#915 M5-04/M5-05).
 *
 * Named поломки this file catches — all «дорогой и молчаливый» отказ: a wrong byte range or a
 * dropped/duplicated ETag produces a *silently corrupted* object in S3 that passes the client and
 * only fails later (or never — a truncated video just plays wrong); an overlapped native range
 * upload is rejected by the accepted Android plugin (`apps/mobile-shell/README.md`: exactly one
 * upload in flight) and loses the part with no user-visible cause; a leaked native handle keeps a
 * full private-cache copy of the recorded video on the device forever.
 *
 * K3 — no URI/base64/whole-file bytes ever cross into JS: the plugin call carries only the opaque
 *      handle plus the exact range.
 * K4 — each destination's own already-authorized begin door is the only door called, and the
 *      caller can express no bucket/key/policy/storage/owner argument (M5-05).
 * K5 — exact bounded offsets/lengths, ordered ETags, complete exactly once; a recoverable part
 *      failure retries the SAME range; exhaustion aborts exactly once; a terminal outcome releases
 *      the native handle exactly once; native range uploads never overlap while the existing
 *      bounded browser `File` parallelism stays operational.
 * K6 — an already-cancelled upload starts no upload at all and still leaks no handle.
 *
 * Oracle: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M5-04/M5-05, the accepted plugin
 * contract in `apps/mobile-shell/README.md`, and the server multipart contract
 * (`modules/media/multipartConstants.ts`: `maxParts = ceil(size / partSize)`;
 * `app/api/media/multipart/complete` requires exactly that many distinct part numbers).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deviceMediaMultipartUpload,
  type DeviceMediaMultipartBeginRequest,
} from './deviceMediaMultipartUpload';
import { browserDeviceMediaSelection, type DeviceMediaNativeSelection } from '@/shared/lib/deviceMedia';

// --- native plugin double (the external boundary) ----------------------------------------------

type UploadArg = {
  handle: string;
  offset: number;
  length: number;
  presignedUrl: string;
  headers: Record<string, string>;
};

type NativeSpy = {
  uploadCalls: UploadArg[];
  releaseCalls: string[];
  maxConcurrentUploads: number;
};

function installNativeShell(
  respond: (arg: UploadArg, callIndex: number) => Promise<unknown>,
): NativeSpy {
  const spy: NativeSpy = { uploadCalls: [], releaseCalls: [], maxConcurrentUploads: 0 };
  let inFlight = 0;
  vi.stubGlobal('window', {
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        DeviceMedia: {
          upload: async (arg: UploadArg) => {
            const index = spy.uploadCalls.length;
            spy.uploadCalls.push({ ...arg });
            inFlight += 1;
            spy.maxConcurrentUploads = Math.max(spy.maxConcurrentUploads, inFlight);
            try {
              // Yield twice so a genuinely parallel scheduler would be observed as inFlight > 1.
              await Promise.resolve();
              await Promise.resolve();
              return await respond(arg, index);
            } finally {
              inFlight -= 1;
            }
          },
          release: async ({ handle }: { handle: string }) => {
            spy.releaseCalls.push(handle);
          },
          cancelUpload: async () => undefined,
        },
      },
    },
  });
  return spy;
}

function uploaded(etag: string) {
  return { outcome: 'uploaded', status: 200, etag };
}

// --- server double -----------------------------------------------------------------------------

type FetchLog = { url: string; body: Record<string, unknown> };

type ServerOpts = {
  partSizeBytes: number;
  maxParts: number;
  sessionId?: string;
  mediaId?: string;
};

function installFetch(opts: ServerOpts): FetchLog[] {
  const log: FetchLog[] = [];
  const sessionId = opts.sessionId ?? 'session-1';
  const mediaId = opts.mediaId ?? 'media-1';
  const json = (value: unknown) => ({
    ok: true,
    status: 200,
    json: async () => value,
  });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if ((init?.signal as AbortSignal | undefined)?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    log.push({ url, body });
    if (url === '/api/media/multipart/part-url') {
      return json({ ok: true, uploadUrl: `https://storage.example/put/${body.partNumber}` });
    }
    if (url === '/api/media/multipart/complete') {
      return json({ ok: true, url: `/api/media/${mediaId}`, mediaId });
    }
    if (url === '/api/media/multipart/abort') {
      return json({ ok: true });
    }
    // Any other URL is a destination begin door.
    return json({
      ok: true,
      mediaId,
      sessionId,
      partSizeBytes: opts.partSizeBytes,
      maxParts: opts.maxParts,
    });
  });
  return log;
}

function nativeSelection(sizeBytes: number): DeviceMediaNativeSelection {
  return {
    origin: 'native',
    handle: 'opaque-handle-42',
    mimeType: 'video/mp4',
    displayName: 'clip.mp4',
    source: 'camera',
    kind: 'video',
    sizeBytes,
    durationSeconds: 42,
  };
}

const PATIENT_FILE_DOOR: DeviceMediaMultipartBeginRequest = {
  url: '/api/doctor/patients/u-1/files',
  extraBody: { category: 'other', fileName: 'clip.mp4', sizeBytes: 80 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('native handle → multipart transport', () => {
  it('K3/K4/K5: sends exact contiguous ranges, ordered ETags, completes once, releases once', async () => {
    const native = installNativeShell(async (arg) =>
      uploaded(`etag-${arg.offset / 32 + 1}`),
    );
    const log = installFetch({ partSizeBytes: 32, maxParts: 3 });
    const progress: [number, number][] = [];

    const result = await deviceMediaMultipartUpload({
      selection: nativeSelection(80),
      begin: PATIENT_FILE_DOOR,
      onProgress: (loaded, total) => progress.push([loaded, total]),
      signal: new AbortController().signal,
    });

    expect(result).toEqual({ url: '/api/media/media-1', mediaId: 'media-1' });

    // K5 — exact bounded offsets/lengths, contiguous, last part truncated to the real size.
    expect(native.uploadCalls.map((c) => [c.offset, c.length])).toEqual([
      [0, 32],
      [32, 32],
      [64, 16],
    ]);
    // …each range PUT to the presigned URL issued for that exact part number.
    expect(native.uploadCalls.map((c) => c.presignedUrl)).toEqual([
      'https://storage.example/put/1',
      'https://storage.example/put/2',
      'https://storage.example/put/3',
    ]);

    // K3 — only the opaque handle and the range cross the bridge: no URI, path or bytes.
    for (const call of native.uploadCalls) {
      expect(Object.keys(call).sort()).toEqual([
        'handle',
        'headers',
        'length',
        'offset',
        'presignedUrl',
      ]);
      expect(call.handle).toBe('opaque-handle-42');
    }

    // K4 — only this destination's own begin door was called, exactly once.
    const beginCalls = log.filter((c) => c.url === PATIENT_FILE_DOOR.url);
    expect(beginCalls).toHaveLength(1);
    expect(beginCalls[0]!.body).toMatchObject({
      uploadMode: 'multipart',
      category: 'other',
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      size: 80,
    });
    // K4/M5-05 — the caller can express no storage/policy/owner/key argument.
    expect(
      Object.keys(beginCalls[0]!.body).filter((k) =>
        /bucket|policy|storage|target|s3|objectkey|ownerUserId|organizationId/i.test(k),
      ),
    ).toEqual([]);

    // K5 — complete exactly once, ETags strictly ascending by part number.
    const completeCalls = log.filter((c) => c.url === '/api/media/multipart/complete');
    expect(completeCalls).toHaveLength(1);
    expect(completeCalls[0]!.body).toEqual({
      sessionId: 'session-1',
      parts: [
        { PartNumber: 1, ETag: 'etag-1' },
        { PartNumber: 2, ETag: 'etag-2' },
        { PartNumber: 3, ETag: 'etag-3' },
      ],
    });
    expect(log.filter((c) => c.url === '/api/media/multipart/abort')).toHaveLength(0);

    // K5 — terminal success releases the native handle exactly once.
    expect(native.releaseCalls).toEqual(['opaque-handle-42']);
    expect(progress.at(-1)).toEqual([80, 80]);
  });

  it('K5: a recoverable part failure retries the SAME range and completes with the retried ETag', async () => {
    let part2Attempts = 0;
    const native = installNativeShell(async (arg) => {
      if (arg.offset === 32) {
        part2Attempts += 1;
        if (part2Attempts === 1) return { outcome: 'upload_failed', status: 500 };
        return uploaded('etag-2-retry');
      }
      return uploaded(`etag-${arg.offset / 32 + 1}`);
    });
    const log = installFetch({ partSizeBytes: 32, maxParts: 3 });

    await deviceMediaMultipartUpload({
      selection: nativeSelection(80),
      begin: PATIENT_FILE_DOOR,
      onProgress: () => {},
      signal: new AbortController().signal,
    });

    const retried = native.uploadCalls.filter((c) => c.offset === 32);
    expect(retried).toHaveLength(2);
    expect(retried.map((c) => c.length)).toEqual([32, 32]);

    const complete = log.find((c) => c.url === '/api/media/multipart/complete');
    expect(complete!.body.parts).toEqual([
      { PartNumber: 1, ETag: 'etag-1' },
      { PartNumber: 2, ETag: 'etag-2-retry' },
      { PartNumber: 3, ETag: 'etag-3' },
    ]);
    expect(log.filter((c) => c.url === '/api/media/multipart/abort')).toHaveLength(0);
    expect(native.releaseCalls).toEqual(['opaque-handle-42']);
  });

  it('K5: retry exhaustion aborts the session exactly once, never completes, releases once', async () => {
    const native = installNativeShell(async (arg) =>
      arg.offset === 32 ? { outcome: 'upload_failed', status: 500 } : uploaded('etag'),
    );
    const log = installFetch({ partSizeBytes: 32, maxParts: 3 });

    await expect(
      deviceMediaMultipartUpload({
        selection: nativeSelection(80),
        begin: PATIENT_FILE_DOOR,
        onProgress: () => {},
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();

    expect(log.filter((c) => c.url === '/api/media/multipart/complete')).toHaveLength(0);
    const aborts = log.filter((c) => c.url === '/api/media/multipart/abort');
    expect(aborts).toHaveLength(1);
    expect(aborts[0]!.body).toEqual({ sessionId: 'session-1' });
    expect(native.releaseCalls).toEqual(['opaque-handle-42']);
  }, 30_000);

  it('K5: never overlaps two native range uploads (accepted plugin concurrency is one)', async () => {
    const native = installNativeShell(async (arg) => uploaded(`etag-${arg.offset}`));
    installFetch({ partSizeBytes: 10, maxParts: 6 });

    await deviceMediaMultipartUpload({
      selection: nativeSelection(60),
      begin: PATIENT_FILE_DOOR,
      onProgress: () => {},
      signal: new AbortController().signal,
    });

    expect(native.uploadCalls).toHaveLength(6);
    expect(native.maxConcurrentUploads).toBe(1);
  });

  it('K6: an already-cancelled upload starts no range upload and leaks no handle', async () => {
    const native = installNativeShell(async () => uploaded('etag'));
    const log = installFetch({ partSizeBytes: 32, maxParts: 3 });
    const ac = new AbortController();
    ac.abort();

    await expect(
      deviceMediaMultipartUpload({
        selection: nativeSelection(80),
        begin: PATIENT_FILE_DOOR,
        onProgress: () => {},
        signal: ac.signal,
      }),
    ).rejects.toThrow();

    expect(native.uploadCalls).toEqual([]);
    expect(log).toEqual([]);
    expect(native.releaseCalls).toEqual(['opaque-handle-42']);
  });
});

describe('browser File → multipart transport', () => {
  class FakeXhr {
    static inFlight = 0;
    static maxInFlight = 0;
    upload = { onprogress: null as null | ((e: unknown) => void) };
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    status = 200;
    private headers: Record<string, string> = {};
    open(): void {}
    setRequestHeader(): void {}
    getResponseHeader(name: string): string | null {
      return this.headers[name.toLowerCase()] ?? null;
    }
    abort(): void {}
    send(): void {
      FakeXhr.inFlight += 1;
      FakeXhr.maxInFlight = Math.max(FakeXhr.maxInFlight, FakeXhr.inFlight);
      this.headers = { etag: `"browser-etag"` };
      setTimeout(() => {
        FakeXhr.inFlight -= 1;
        this.onload?.();
      }, 5);
    }
  }

  beforeEach(() => {
    FakeXhr.inFlight = 0;
    FakeXhr.maxInFlight = 0;
  });

  it('K5: keeps the existing bounded parallel browser part upload (native serialization is native-only)', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    installFetch({ partSizeBytes: 10, maxParts: 6 });

    const file = new File([new Uint8Array(60)], 'clip.mp4', { type: 'video/mp4' });
    await deviceMediaMultipartUpload({
      selection: browserDeviceMediaSelection(file, 'gallery'),
      begin: { url: '/api/media/multipart/init', extraBody: { folderId: null } },
      onProgress: () => {},
      signal: new AbortController().signal,
    });

    expect(FakeXhr.maxInFlight).toBeGreaterThan(1);
    expect(FakeXhr.maxInFlight).toBeLessThanOrEqual(4);
  });
});
