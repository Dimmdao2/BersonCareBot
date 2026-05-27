import { randomUUID } from "node:crypto";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { WebPushClientPayload } from "@/modules/web-push/sendWebPushToSubscriptions";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";

export type CreateTrackedWebPushInput = {
  userId: string;
  title: string;
  body: string;
  url: string;
  tag?: string;
  topicCode?: string | null;
  intentType?: string | null;
  occurrenceId?: string | null;
  pushKind?: string | null;
  warmupSloganKey?: string | null;
};

/**
 * Registers `product_push_notifications` (+ hourly `push_sent`) and returns SW payload fields.
 * On failure still returns copy without `trackingId` so delivery is not blocked.
 */
export async function createTrackedWebPushPayload(
  input: CreateTrackedWebPushInput,
): Promise<WebPushClientPayload> {
  const base: WebPushClientPayload = {
    title: input.title,
    body: input.body,
    url: input.url,
    ...(input.tag ? { tag: input.tag } : {}),
  };

  if (!isPlatformUserUuid(input.userId)) {
    return base;
  }

  const occurrenceId =
    input.occurrenceId && isPlatformUserUuid(input.occurrenceId) ? input.occurrenceId : null;

  const trackingId = randomUUID();
  try {
    const deps = buildAppDeps();
    await deps.productAnalytics.createPushNotification({
      id: trackingId,
      userId: input.userId,
      topicCode: input.topicCode ?? null,
      intentType: input.intentType ?? null,
      occurrenceId,
      pushKind: input.pushKind ?? null,
      warmupSloganKey: input.warmupSloganKey ?? null,
      warmupSloganText: input.pushKind === "warmup" ? input.body : null,
      openUrl: input.url,
      title: input.title,
    });
  } catch {
    return base;
  }

  return {
    ...base,
    trackingId,
    topicCode: input.topicCode ?? null,
    intentType: input.intentType ?? null,
    pushKind: input.pushKind ?? null,
    warmupSloganKey: input.warmupSloganKey ?? null,
  };
}

export function productAnalyticsMetadataFromPayload(
  payload: WebPushClientPayload,
): Record<string, unknown> | undefined {
  if (!payload.trackingId) return undefined;
  return {
    trackingId: payload.trackingId,
    ...(payload.pushKind ? { pushKind: payload.pushKind } : {}),
    ...(payload.warmupSloganKey ? { warmupSloganKey: payload.warmupSloganKey } : {}),
  };
}
