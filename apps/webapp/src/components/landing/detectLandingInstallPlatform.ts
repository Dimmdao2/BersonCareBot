export type LandingInstallPlatform = "ios" | "android";

/** Определяет основную инструкцию установки по user agent (клиент). */
export function detectLandingInstallPlatform(
  userAgent: string,
  maxTouchPoints = 0,
): LandingInstallPlatform {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // iPadOS 13+ иногда отдаёт Macintosh
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return "ios";
}

/**
 * Возвращает `true`, если определённый браузер НЕ подходит для установки PWA
 * на данной платформе:
 *  - iOS: нужен Safari (CriOS, FxiOS, EdgiOS, GSA — не Safari)
 *  - Android: нужен Chrome (Edge/Opera/Samsung/Yandex — не Chrome)
 *
 * Возвращает `false` на десктопе или при неопределённом UA.
 */
export function detectRequiredBrowserMissing(
  userAgent: string,
  platform: LandingInstallPlatform,
): boolean {
  if (platform === "ios") {
    const isSafari =
      /Safari/i.test(userAgent) &&
      !/CriOS|FxiOS|OPiOS|EdgiOS|GSA/i.test(userAgent);
    return !isSafari;
  }
  if (platform === "android") {
    const isChrome =
      /Chrome\//i.test(userAgent) &&
      !/EdgA|OPR\/|SamsungBrowser|YaBrowser/i.test(userAgent);
    return !isChrome;
  }
  return false;
}
