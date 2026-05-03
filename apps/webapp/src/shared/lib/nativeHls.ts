/**
 * Safari / iOS expose native HLS via MSE-unavailable path (canPlayType on application/vnd.apple.mpegurl).
 * `videoProbe` supports unit tests without a browser DOM.
 */
export function shouldUseNativeHls(videoProbe?: { canPlayType: (type: string) => string }): boolean {
  const probe =
    videoProbe ??
    (typeof document !== "undefined" ? document.createElement("video") : undefined);
  if (!probe) return false;
  return probe.canPlayType("application/vnd.apple.mpegurl") !== "";
}
