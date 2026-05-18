import { routePaths } from "@/app-layer/routes/paths";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";

/** Registers `public/sw.js` for patient PWA (scope `/app`). No-op in messenger Mini App. */
export async function registerPatientServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  if (isMessengerMiniAppHost()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: routePaths.root });
  } catch {
    return null;
  }
}
