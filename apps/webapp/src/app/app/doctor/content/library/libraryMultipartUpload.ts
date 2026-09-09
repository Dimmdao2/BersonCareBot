import { browserDeviceMediaSelection } from '@/shared/lib/deviceMedia';
import {
  abortDeviceMediaMultipartSession,
  deviceMediaMultipartUpload,
} from '@/shared/lib/media/deviceMediaMultipartUpload';

/** Destination-agnostic session abort — kept under its original name for existing callers. */
export const libraryMultipartAbort = abortDeviceMediaMultipartSession;

/**
 * Full multipart flow for CMS library: init → part URLs + PUT parts (parallel workers) → complete.
 * Thin wrapper over the shared {@link deviceMediaMultipartUpload} lifecycle, parameterized to the
 * CMS library begin door — the engine itself (retries, concurrency, progress, abort) lives there
 * so a native-handle upload from the same library UI does not need a second implementation.
 */
export async function libraryMultipartUpload(params: {
  file: File;
  folderId: string | null;
  onProgress: (loaded: number, total: number) => void;
  signal: AbortSignal;
  onSessionReady?: (sessionId: string) => void;
}): Promise<{ url: string; mediaId: string }> {
  return deviceMediaMultipartUpload({
    selection: browserDeviceMediaSelection(params.file, 'gallery'),
    begin: { url: '/api/media/multipart/init', extraBody: { folderId: params.folderId } },
    onProgress: params.onProgress,
    signal: params.signal,
    onSessionReady: params.onSessionReady,
  });
}
