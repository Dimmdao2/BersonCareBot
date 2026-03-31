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

