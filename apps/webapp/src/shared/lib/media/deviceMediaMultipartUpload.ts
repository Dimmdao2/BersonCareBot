'use client';

/**
 * One multipart client lifecycle (M5-04) shared by every destination that already exposes
 * `uploadMode: 'multipart'` on its begin door (CMS library, patient program submission, doctor
 * patient-file, individual-exercise video — `modules/media/media.md`): init → bounded part URL →
 * browser `File.slice` PUT *or* native `DeviceMedia.upload(range)` → ordered ETags → complete.
 * `/api/media/multipart/part-url|complete|abort` are already destination-agnostic (they derive
 * authorization from the session row's own owner/org), so this module only varies the *begin*
 * call — it never chooses a bucket, key, or policy (`check-media-upload-door.mjs`, M5-05).
 *
 * The accepted Android plugin allows exactly one native range upload in flight
 * (`DeviceMediaPlugin.upload` rejects a concurrent call). Concurrency is therefore `1` for a
 * native handle and stays the existing bounded value for a browser `File`, from one scheduler —
 * this file is the only place that claims a part number and runs its worker loop.
 */
import { putPartWithProgress, UploadRequestError } from '@/shared/lib/media/uploadTransport';
import { beginBusy, endBusy } from '@/shared/lib/busyRegistry';
import {
  releaseNativeDeviceMediaHandle,
  uploadNativeDeviceMediaRange,
} from '@/shared/lib/nativeShellRuntime';
import {
  deviceMediaSelectionFilename,
  deviceMediaSelectionMimeType,
  type DeviceMediaSelection,
} from '@/shared/lib/deviceMedia';

export type DeviceMediaMultipartBeginRequest = {
  /** One of the already-authorized begin doors; each supplies its own closed server policy. */
  url: string;
  /** Destination-specific fields (`folderId`, `instanceId`, `category`, …) — never bucket/key/policy. */
  extraBody?: Record<string, unknown>;
};

type InitOk = {
  ok?: boolean;
  mediaId?: string;
  sessionId?: string;
  partSizeBytes?: number;
  maxParts?: number;
  error?: string;
};

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries<T>(fn: () => Promise<T>, signal: AbortSignal, label: string): Promise<T> {
  const max = 5;
  for (let attempt = 0; attempt < max; attempt += 1) {
    if (signal.aborted) {
      throw new UploadRequestError(0, { error: 'aborted' });
    }
    try {
      return await fn();
    } catch (e) {
      if (attempt + 1 >= max) {
        throw new UploadRequestError(0, {
          error: 'part_retry_exhausted',
          cause: e instanceof UploadRequestError ? e.data : undefined,
        });
      }
      const base = Math.min(8000, 250 * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 200);
      await sleep(base + jitter);
    }
  }
  throw new Error(`multipart_retry_unreachable:${label}`);
}

/** Destination-agnostic: the session row already carries its own owner/org/policy. */
export async function abortDeviceMediaMultipartSession(sessionId: string): Promise<void> {
  await fetch('/api/media/multipart/abort', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
}

export async function deviceMediaMultipartUpload(params: {
  selection: DeviceMediaSelection;
  begin: DeviceMediaMultipartBeginRequest;
  onProgress: (loaded: number, total: number) => void;
  signal: AbortSignal;
  onSessionReady?: (sessionId: string) => void;
}): Promise<{ url: string; mediaId: string }> {
  const { selection } = params;
  const isNative = selection.origin === 'native';
  const filename = deviceMediaSelectionFilename(selection);
  const mime = deviceMediaSelectionMimeType(selection);
  const totalBytes = selection.sizeBytes;

  const busyId = `media-upload:${filename}:${totalBytes}:${Date.now()}`;
  beginBusy(busyId);

  try {
    const initRes = await fetch(params.begin.url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename,
        mimeType: mime,
        size: totalBytes,
        uploadMode: 'multipart',
        ...(params.begin.extraBody ?? {}),
      }),
      signal: params.signal,
    });
    const initJson = (await initRes.json().catch(() => ({}))) as InitOk;
    if (
      !initRes.ok ||
      !initJson.ok ||
      !initJson.sessionId ||
      !initJson.partSizeBytes ||
      !initJson.maxParts
    ) {
      throw new UploadRequestError(initRes.status, initJson);
    }

    const { sessionId, partSizeBytes, maxParts } = initJson;
    params.onSessionReady?.(sessionId);
    let sessionNeedsAbort: string | null = sessionId;

    const parts: { PartNumber: number; ETag: string }[] = new Array(maxParts);
    const partLoaded = new Float64Array(maxParts);
    const reportProgress = () => {
      let sum = 0;
      for (let i = 0; i < maxParts; i += 1) sum += partLoaded[i];
      params.onProgress(Math.min(Math.round(sum), totalBytes), totalBytes);
    };

    const uploadOnePart = async (partNumber: number) => {
      const start = (partNumber - 1) * partSizeBytes;
      const end = Math.min(start + partSizeBytes, totalBytes);
      const length = end - start;

      const putUrl = await withRetries(
        async () => {
          const r = await fetch('/api/media/multipart/part-url', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, partNumber }),
            signal: params.signal,
          });
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; uploadUrl?: string; error?: string };
          if (!r.ok || !j.ok || !j.uploadUrl) {
            throw new UploadRequestError(r.status, j);
          }
          return j.uploadUrl;
        },
        params.signal,
        'part-url',
      );

      const etag = await withRetries(
        async () => {
          if (!isNative) {
            const blob = selection.file.slice(start, end);
            return putPartWithProgress({
              url: putUrl,
              body: blob,
              signal: params.signal,
              onProgress: (loaded, tot) => {
                if (length <= 0) return;
                partLoaded[partNumber - 1] = (loaded / (tot || 1)) * length;
                reportProgress();
              },
            });
          }
          const result = await uploadNativeDeviceMediaRange({
            handle: selection.handle,
            offset: start,
            length,
            presignedUrl: putUrl,
            headers: {},
          });
          if (!result) throw new UploadRequestError(0, { error: 'native_upload_unavailable' });
          if (result.outcome === 'upload_failed') {
            throw new UploadRequestError(result.status, { error: 'upload_failed' });
          }
          return result.etag;
        },
        params.signal,
        `part-${partNumber}`,
      );

      if (length > 0) {
        partLoaded[partNumber - 1] = length;
        reportProgress();
      }
      parts[partNumber - 1] = { PartNumber: partNumber, ETag: etag };
    };

    let cursor = 0;
    const claimPart = (): number | null => {
      cursor += 1;
      if (cursor > maxParts) return null;
      return cursor;
    };

    // The native plugin permits exactly one upload in flight; a browser `File` keeps the
    // existing bounded worker pool.
    const concurrency = isNative ? 1 : Math.min(4, maxParts);
    const workers = Array.from({ length: concurrency }, async () => {
      for (let pn = claimPart(); pn !== null; pn = claimPart()) {
        await uploadOnePart(pn);
      }
    });

    try {
      await Promise.all(workers);

      for (let i = 0; i < parts.length; i += 1) {
        if (!parts[i]) {
          throw new UploadRequestError(0, { error: 'incomplete_parts' });
        }
      }
      const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);

      const completeRes = await fetch('/api/media/multipart/complete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, parts: sortedParts }),
        signal: params.signal,
      });
      const completeJson = (await completeRes.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        mediaId?: string;
        error?: string;
      };
      if (!completeRes.ok || !completeJson.ok || !completeJson.url || !completeJson.mediaId) {
        throw new UploadRequestError(completeRes.status, completeJson);
      }

      sessionNeedsAbort = null;
      return { url: completeJson.url, mediaId: completeJson.mediaId };
    } catch (e) {
      if (sessionNeedsAbort) {
        await abortDeviceMediaMultipartSession(sessionNeedsAbort);
      }
      throw e;
    }
  } finally {
    endBusy(busyId);
    // Terminal (success/abort/error) — release exactly once. A recoverable part retry above
    // never reaches here, so it correctly reuses the same handle/range.
    if (isNative) await releaseNativeDeviceMediaHandle(selection.handle);
  }
}
