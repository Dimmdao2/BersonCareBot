"use client";

export class UploadRequestError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super("upload_request_failed");
    this.name = "UploadRequestError";
    this.status = status;
    this.data = data;
  }
}

type UploadWithProgressArgs = {
  url: string;
  formData: FormData;
  withCredentials?: boolean;
  onProgress?: (loaded: number, total: number) => void;
};

export function uploadWithProgress<T>({
  url,
  formData,
  withCredentials = true,
  onProgress,
}: UploadWithProgressArgs): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = withCredentials;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(event.loaded, event.total);
    };

    xhr.onerror = () => {
      reject(new UploadRequestError(0, { error: "network_error" }));
    };

    xhr.onload = () => {
      let parsed: unknown = {};
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        parsed = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed as T);
        return;
      }
      reject(new UploadRequestError(xhr.status, parsed));
    };

    xhr.send(formData);
  });
}

type PutWithProgressArgs = {
  url: string;
  body: Blob;
  contentType: string;
  onProgress?: (loaded: number, total: number) => void;
};

/** Direct PUT to presigned S3 URL (no credentials — cross-origin to MinIO). */
export function putWithProgress({
  url,
  body,
  contentType,
  onProgress,
}: PutWithProgressArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(event.loaded, event.total);
    };

    xhr.onerror = () => {
      reject(new UploadRequestError(0, { error: "network_error" }));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let parsed: unknown = {};
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        parsed = { raw: xhr.responseText };
      }
      reject(new UploadRequestError(xhr.status, parsed));
    };

    xhr.send(body);
  });
}

type PutPartArgs = {
  url: string;
  body: Blob;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
};

/** Multipart UploadPart: no Content-Type header (must match presigned request). Returns raw ETag header value. */
export function putPartWithProgress({ url, body, onProgress, signal }: PutPartArgs): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);

    const onAbort = () => {
      xhr.abort();
    };
    if (signal) {
      if (signal.aborted) {
        reject(new UploadRequestError(0, { error: "aborted" }));
        return;
      }
      signal.addEventListener("abort", onAbort);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(event.loaded, event.total);
    };

    xhr.onerror = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(new UploadRequestError(0, { error: "network_error" }));
    };

    xhr.onload = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) {
          reject(new UploadRequestError(xhr.status, { error: "missing_etag" }));
          return;
        }
        resolve(etag);
        return;
      }
      reject(new UploadRequestError(xhr.status, { raw: xhr.responseText }));
    };

    xhr.send(body);
  });
}

