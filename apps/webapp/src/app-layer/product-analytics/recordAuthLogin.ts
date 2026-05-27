import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ProductAnalyticsEntryChannel } from "@/modules/product-analytics/types";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";

export type RecordAuthLoginParams = {
  userId: string;
  entryChannel: ProductAnalyticsEntryChannel;
  authMethod: string;
};

/** Best-effort product analytics after successful webapp login (must not throw into auth flow). */
export async function recordAuthLogin(params: RecordAuthLoginParams): Promise<void> {
  const userId = params.userId.trim();
  if (!userId || !isPlatformUserUuid(userId)) return;

  try {
    const deps = buildAppDeps();
    await deps.productAnalytics.recordEventsBatch([
      {
        eventType: "auth_login",
        entryChannel: params.entryChannel,
        userId,
        metadata: { authMethod: params.authMethod },
      },
    ]);
  } catch {
    /* analytics must not break auth */
  }
}

export function entryChannelFromMessengerBindings(bindings?: {
  telegramId?: string | null;
  maxId?: string | null;
}): ProductAnalyticsEntryChannel {
  if (bindings?.maxId?.trim()) return "max";
  if (bindings?.telegramId?.trim()) return "telegram";
  return "browser";
}
