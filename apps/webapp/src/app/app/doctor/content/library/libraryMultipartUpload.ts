import { putPartWithProgress, UploadRequestError } from "./uploadWithProgress";

export async function libraryMultipartAbort(sessionId: string): Promise<void> {
  await fetch("/api/media/multipart/abort", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

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
      throw new UploadRequestError(0, { error: "aborted" });
    }
    try {
      return await fn();
    } catch (e) {
      if (attempt + 1 >= max) {
        throw new UploadRequestError(0, {
          error: "part_retry_exhausted",
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

/**
 * Full multipart flow for CMS library: init → part URLs + PUT parts (parallel workers) → complete.
 */
export async function libraryMultipartUpload(params: {
  file: File;
  folderId: string | null;
  onProgress: (loaded: number, total: number) => void;
  signal: AbortSignal;
  onSessionReady?: (sessionId: string) => void;
}): Promise<{ url: string; mediaId: string }> {
  const mime = (params.file.type || "application/octet-stream").toLowerCase();
  const totalBytes = params.file.size;

  const initRes = await fetch("/api/media/multipart/init", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: params.file.name || "upload",
      mimeType: mime,
      size: totalBytes,
      folderId: params.folderId,
    }),
    signal: params.signal,
  });
  const initJson = (await initRes.json().catch(() => ({}))) as InitOk;
  if (!initRes.ok || !initJson.ok || !initJson.sessionId || !initJson.partSizeBytes || !initJson.maxParts) {
    throw new UploadRequestError(initRes.status, initJson);
  }

  const { sessionId, partSizeBytes, maxParts } = initJson;
  params.onSessionReady?.(sessionId);
  let sessionNeedsAbort: string | null = sessionId;

  const parts: { PartNumber: number; ETag: string }[] = new Array(maxParts);

  const uploadOnePart = async (partNumber: number) => {
    const start = (partNumber - 1) * partSizeBytes;
    const end = Math.min(start + partSizeBytes, totalBytes);
    const blob = params.file.slice(start, end);

    const putUrl = await withRetries(
      async () => {
        const r = await fetch("/api/media/multipart/part-url", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
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
      "part-url",
    );

    const etag = await withRetries(
      async () =>
        putPartWithProgress({
          url: putUrl,
          body: blob,
          signal: params.signal,
          onProgress: (loaded, tot) => {
            const slice = end - start;
            const base = ((partNumber - 1) / maxParts) * totalBytes;
            const add = (loaded / (tot || 1)) * (slice / maxParts);
            params.onProgress(Math.min(Math.round(base + add), totalBytes), totalBytes);
          },
        }),
      params.signal,
      `part-${partNumber}`,
    );

    parts[partNumber - 1] = { PartNumber: partNumber, ETag: etag };
  };

  let cursor = 0;
  const claimPart = (): number | null => {
    cursor += 1;
    if (cursor > maxParts) return null;
    return cursor;
  };

  const concurrency = Math.min(4, maxParts);
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const pn = claimPart();
      if (pn === null) break;
      await uploadOnePart(pn);
    }
  });

  try {
    await Promise.all(workers);

    for (let i = 0; i < parts.length; i += 1) {
      if (!parts[i]) {
        throw new UploadRequestError(0, { error: "incomplete_parts" });
      }
    }
    const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);

    const completeRes = await fetch("/api/media/multipart/complete", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
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
      await libraryMultipartAbort(sessionNeedsAbort);
    }
    throw e;
  }
}
