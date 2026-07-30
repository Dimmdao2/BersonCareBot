import { useSyncExternalStore } from 'react';

/**
 * Safari / iOS expose native HLS via MSE-unavailable path (canPlayType on application/vnd.apple.mpegurl).
 * `videoProbe` supports unit tests without a browser DOM.
 */
export function shouldUseNativeHls(videoProbe?: {
  canPlayType: (type: string) => string;
}): boolean {
  const probe =
    videoProbe ?? (typeof document !== 'undefined' ? document.createElement('video') : undefined);
  if (!probe) return false;
  return probe.canPlayType('application/vnd.apple.mpegurl') !== '';
}

const subscribeNativeHlsCapability = () => () => {};
const getNativeHlsBrowserSnapshot = () => shouldUseNativeHls();
const getNativeHlsServerSnapshot = () => false;

/**
 * SSR-safe native HLS capability.
 *
 * The first browser render must use the same `false` snapshot as SSR. Safari capability is applied
 * immediately after hydration; calling `shouldUseNativeHls()` directly during render makes the
 * server and Safari produce different trees.
 */
export function useNativeHlsPlayback(): boolean {
  return useSyncExternalStore(
    subscribeNativeHlsCapability,
    getNativeHlsBrowserSnapshot,
    getNativeHlsServerSnapshot,
  );
}
