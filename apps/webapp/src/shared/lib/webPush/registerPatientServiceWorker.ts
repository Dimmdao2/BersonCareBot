import { routePaths } from '@/app-layer/routes/paths';
import { isMessengerMiniAppHost } from '@/shared/lib/messengerMiniApp';
import { isNativeShellActive } from '@/shared/lib/nativeShellRuntime';

/**
 * The one service-worker registration door for `public/sw.js` (patient AND staff PWA, scope `/app`).
 * No-op in messenger Mini App and in the Capacitor native shell (M1-07) — every PWA bypass routes
 * through this function instead of repeating its own native check.
 */
export async function registerPatientServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (isMessengerMiniAppHost() || isNativeShellActive()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: routePaths.root });
  } catch {
    return null;
  }
}
