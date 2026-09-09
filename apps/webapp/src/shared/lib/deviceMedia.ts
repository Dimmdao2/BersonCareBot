'use client';

/**
 * One `DeviceMedia` client contract (M5-01): every reachable media source point parameterizes
 * this seam instead of inspecting `window.Capacitor`/user agent/hostname itself. The native half
 * lives behind `nativeShellRuntime.ts` (the only file allowed to read the Capacitor global); this
 * module only maps its typed outcomes into one closed selection union and never widens what a
 * caller can express (no bucket/key/storage/policy — that stays the server door's job, §M5-05).
 *
 * Browser selection keeps the existing standards-based `<input type="file">` unchanged (M5-06):
 * this module does not replace it, it only adds the native branch a caller chooses *before*
 * clicking/awaiting anything, so the browser gesture is never lost waiting on native detection.
 */
import {
  captureNativeDeviceMedia,
  pickNativeDeviceDocument,
  pickNativeDeviceMedia,
  type NativeDeviceMediaKind,
  type NativeDeviceMediaSource,
} from '@/shared/lib/nativeShellRuntime';
import type { NativeRuntimeSnapshot } from '@/shared/lib/platform';

/** Same three-way kind the native plugin already uses (`apps/mobile-shell/README.md`). */
export type DeviceMediaKind = NativeDeviceMediaKind;
export type DeviceMediaSource = NativeDeviceMediaSource;

/** Browser selection carries the real `File` plus the same normalized metadata shape as native. */
export type DeviceMediaBrowserSelection = {
  origin: 'browser';
  file: File;
  source: DeviceMediaSource;
  kind: DeviceMediaKind;
  sizeBytes: number;
  durationSeconds: number | null;
};

/** Native selection never carries a URI or bytes — only the opaque handle plus its descriptor. */
export type DeviceMediaNativeSelection = {
  origin: 'native';
  handle: string;
  mimeType: string;
  displayName: string;
  source: DeviceMediaSource;
  kind: DeviceMediaKind;
  sizeBytes: number;
  durationSeconds: number | null;
};

export type DeviceMediaSelection = DeviceMediaBrowserSelection | DeviceMediaNativeSelection;

/** Cancellation is a normal typed outcome, never a fake upload error (§ contract). */
export type DeviceMediaPickResult =
  | { outcome: 'selected'; selection: DeviceMediaNativeSelection }
  | { outcome: 'cancelled' }
  | { outcome: 'unavailable' };

function kindFromMime(mimeType: string): DeviceMediaKind {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith('video/')) return 'video';
  if (lower.startsWith('image/')) return 'photo';
  return 'document';
}

/** Wraps a `File` picked through a standards-based `<input type="file">` in the same envelope
 * native selections use, so a single upload/preview code path can consume either origin. */
export function browserDeviceMediaSelection(
  file: File,
  source: DeviceMediaSource,
): DeviceMediaBrowserSelection {
  return {
    origin: 'browser',
    file,
    source,
    kind: kindFromMime(file.type || 'application/octet-stream'),
    sizeBytes: file.size,
    durationSeconds: null,
  };
}

/**
 * Synchronous capability check — safe to call inside a click handler before deciding whether to
 * `await` a native call or `.click()` a hidden browser input in the same gesture (M5-06).
 */
export function isNativeDeviceMediaAvailable(runtime: NativeRuntimeSnapshot): boolean {
  return runtime.kind !== 'browser' && runtime.capabilities.media;
}

function toPickResult(
  outcome: Awaited<ReturnType<typeof captureNativeDeviceMedia>>,
  source: DeviceMediaSource,
): DeviceMediaPickResult {
  if (!outcome) return { outcome: 'unavailable' };
  if (outcome.outcome === 'cancelled') return { outcome: 'cancelled' };
  return {
    outcome: 'selected',
    selection: {
      origin: 'native',
      handle: outcome.handle,
      mimeType: outcome.mimeType,
      displayName: outcome.displayName,
      source,
      kind: outcome.kind,
      sizeBytes: outcome.sizeBytes,
      durationSeconds: outcome.durationSeconds,
    },
  };
}

/** Opens the native CameraX screen (M5-02); the user can still switch Photo/Video inside it. */
export async function captureDeviceMedia(kind: 'photo' | 'video'): Promise<DeviceMediaPickResult> {
  return toPickResult(await captureNativeDeviceMedia(kind), 'camera');
}

/** System gallery picker, images and videos together (M5-03). */
export async function pickDeviceMediaFromGallery(opts?: {
  requiresDuration?: boolean;
}): Promise<DeviceMediaPickResult> {
  return toPickResult(await pickNativeDeviceMedia(opts), 'gallery');
}

/** System document picker with a narrow, natively re-validated MIME allowlist (M5-03). */
export async function pickDeviceDocument(mimeTypes: string[]): Promise<DeviceMediaPickResult> {
  return toPickResult(await pickNativeDeviceDocument(mimeTypes), 'document');
}

/** Filename a begin door should record — the real `File.name` for browser, the native descriptor
 * `displayName` for native (the plugin never exposes a filesystem path/URI). */
export function deviceMediaSelectionFilename(selection: DeviceMediaSelection): string {
  return selection.origin === 'native' ? selection.displayName : selection.file.name || 'upload';
}

export function deviceMediaSelectionMimeType(selection: DeviceMediaSelection): string {
  const raw = selection.origin === 'native' ? selection.mimeType : selection.file.type;
  return (raw || 'application/octet-stream').toLowerCase();
}
