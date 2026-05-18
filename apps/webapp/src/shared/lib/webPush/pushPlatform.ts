import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";

export type WebPushClientPlatform = "pwa" | "browser" | "ios-pwa" | "android-pwa";

export function isIosTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  return navigator.platform === "MacIntel" && maxTouchPoints > 1;
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** Push на iOS/Android обычно доступен только после установки PWA (не во вкладке Safari). */
export function isPushLikelyAfterPwaInstall(): boolean {
  if (typeof window === "undefined") return false;
  if (isStandalonePwa()) return false;
  return isIosTouchDevice() || isAndroidDevice();
}

/** Client hint for subscribe / analytics (not a security boundary). */
export function detectWebPushClientPlatform(): WebPushClientPlatform {
  if (!isStandalonePwa()) return "browser";
  if (isIosTouchDevice()) return "ios-pwa";
  if (isAndroidDevice()) return "android-pwa";
  return "pwa";
}
