/** Installed PWA / Add to Home Screen (iOS `navigator.standalone` + `display-mode: standalone`). */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}
