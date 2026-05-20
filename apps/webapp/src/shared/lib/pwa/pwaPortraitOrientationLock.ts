type DocumentWithWebkitFullscreen = Document & {
  webkitFullscreenElement?: Element | null;
};

type PwaOrientationLockType =
  | "any"
  | "natural"
  | "landscape"
  | "portrait"
  | "portrait-primary"
  | "landscape-primary"
  | "portrait-secondary"
  | "landscape-secondary";

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: PwaOrientationLockType) => Promise<void>;
  unlock?: () => void;
};

export function readDocumentFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const doc = document as DocumentWithWebkitFullscreen;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function isVideoElementFullscreen(element: Element | null): boolean {
  return element?.localName === "video";
}

export function isLandscapeViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(orientation: landscape)").matches;
}

export async function tryLockPortraitOrientation(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const orientation = window.screen?.orientation as ScreenOrientationWithLock | undefined;
  const lock = orientation?.lock;
  if (typeof lock !== "function") return false;
  try {
    await lock.call(orientation, "portrait-primary");
    return true;
  } catch {
    return false;
  }
}

export function tryUnlockOrientation(): void {
  if (typeof window === "undefined") return;
  const orientation = window.screen?.orientation as ScreenOrientationWithLock | undefined;
  try {
    orientation?.unlock?.();
  } catch {
    // Platform may reject unlock while not locked.
  }
}

export type PwaPortraitOrientationSyncInput = {
  webkitVideoFullscreen: boolean;
};

export type PwaPortraitOrientationSyncResult = {
  videoFullscreen: boolean;
  apiLocked: boolean;
  fallbackLandscape: boolean;
};

/** Lock portrait in standalone PWA; unlock during native / webkit video fullscreen. */
export async function syncPwaPortraitOrientationLock(
  input: PwaPortraitOrientationSyncInput,
): Promise<PwaPortraitOrientationSyncResult> {
  const videoFullscreen =
    input.webkitVideoFullscreen || isVideoElementFullscreen(readDocumentFullscreenElement());

  if (typeof document === "undefined") {
    return { videoFullscreen, apiLocked: false, fallbackLandscape: false };
  }

  const docEl = document.documentElement;

  if (videoFullscreen) {
    docEl.dataset.pwaVideoFullscreen = "1";
    tryUnlockOrientation();
    delete docEl.dataset.pwaOrientationFallback;
    return { videoFullscreen: true, apiLocked: false, fallbackLandscape: false };
  }

  delete docEl.dataset.pwaVideoFullscreen;

  const apiLocked = await tryLockPortraitOrientation();
  if (apiLocked) {
    delete docEl.dataset.pwaOrientationFallback;
    return { videoFullscreen: false, apiLocked: true, fallbackLandscape: false };
  }

  if (isLandscapeViewport()) {
    docEl.dataset.pwaOrientationFallback = "landscape";
    return { videoFullscreen: false, apiLocked: false, fallbackLandscape: true };
  }

  delete docEl.dataset.pwaOrientationFallback;
  return { videoFullscreen: false, apiLocked: false, fallbackLandscape: false };
}

export function clearPwaPortraitOrientationLockAttributes(): void {
  if (typeof document === "undefined") return;
  const docEl = document.documentElement;
  delete docEl.dataset.pwaPortraitLock;
  delete docEl.dataset.pwaVideoFullscreen;
  delete docEl.dataset.pwaOrientationFallback;
}
