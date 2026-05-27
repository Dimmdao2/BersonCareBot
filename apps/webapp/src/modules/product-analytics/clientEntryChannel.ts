import {
  getMaxWebAppInitDataForAuth,
  isMessengerMiniAppHost,
  readTelegramInitDataForAuth,
} from "@/shared/lib/messengerMiniApp";
import { readMessengerSurfaceCookie } from "@/shared/lib/platform";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";
import type { ProductAnalyticsEntryChannel } from "@/modules/product-analytics/types";

/** Client-only: канал входа для ingest (см. product analytics plan). */
export function resolveClientEntryChannel(): ProductAnalyticsEntryChannel {
  if (typeof window === "undefined") return "browser";

  const surface = readMessengerSurfaceCookie();
  if (isMessengerMiniAppHost()) {
    if (surface === "max") return "max";
    if (surface === "telegram") return "telegram";
    if (getMaxWebAppInitDataForAuth().length > 0 && readTelegramInitDataForAuth().length === 0) {
      return "max";
    }
    return "telegram";
  }

  if (isStandalonePwa()) return "pwa";
  return "browser";
}
