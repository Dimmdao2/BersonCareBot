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
