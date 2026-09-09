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
  releaseNativeDeviceMediaHandle,
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

/**
 * The one narrow document-MIME allowlist this seam will ever request (M5-03) — matches the
 * accepted Android plugin's own request-filter/result re-check allowlist exactly
 * (`DeviceMediaPlugin.DOCUMENT_MIME_PATTERN`, `apps/mobile-shell/android/.../DeviceMediaPlugin.java`).
 * `pickDeviceDocument` takes no caller-supplied MIME list — widening this is a native-plugin change,
 * never a client-side argument.
 */
export const NATIVE_DOCUMENT_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

/** System document picker with the narrow, natively re-validated MIME allowlist above (M5-03). */
export async function pickDeviceDocument(): Promise<DeviceMediaPickResult> {
  return toPickResult(await pickNativeDeviceDocument([...NATIVE_DOCUMENT_MIME_TYPES]), 'document');
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

/**
 * Ownership chokepoint (audit MUST FIX 1, #915 correction, §5 «один общий проход»): a native
 * selection is an owned resource from `{outcome:'selected'}` until it is either transferred into
 * `deviceMediaMultipartUpload` (which disposes it in its own terminal `finally`) or discarded here
 * directly. Every caller — refusal before begin, wrong-kind refusal, replacement, dialog
 * close/reset, component teardown, AND the upload lifecycle's own terminal path — calls this same
 * function on the *same selection object reference* it was handed; it is idempotent per selection
 * (a `WeakSet`, checked-then-added synchronously with no `await` in between), so no path can
 * double-release or race the upload's own release. Keyed by object identity rather than the handle
 * string on purpose — two unrelated picks never collide even if a plugin/test double reuses a
 * handle value, and entries never need manual eviction (GC reclaims them with the selection).
 * Browser selections are always a no-op — nothing native to release.
 */
const releasedNativeDeviceMediaSelections = new WeakSet<DeviceMediaNativeSelection>();

export async function disposeDeviceMediaSelection(selection: DeviceMediaSelection): Promise<void> {
  if (selection.origin !== 'native') return;
  if (releasedNativeDeviceMediaSelections.has(selection)) return;
  releasedNativeDeviceMediaSelections.add(selection);
  await releaseNativeDeviceMediaHandle(selection.handle);
}
