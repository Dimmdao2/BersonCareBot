import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";

export type WebPushClientPlatform = "pwa" | "browser" | "ios-pwa" | "android-pwa";

function isIosTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  return navigator.platform === "MacIntel" && maxTouchPoints > 1;
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** Client hint for subscribe / analytics (not a security boundary). */
export function detectWebPushClientPlatform(): WebPushClientPlatform {
  if (!isStandalonePwa()) return "browser";
  if (isIosTouchDevice()) return "ios-pwa";
  if (isAndroid()) return "android-pwa";
  return "pwa";
}
