import { createPgWebPushSubscriptionsPort } from "@/infra/repos/pgWebPushSubscriptions";
import type { WebPushSubscriptionPayloadV1 } from "@/modules/web-push/ports";

const webPushSubscriptionsPort = createPgWebPushSubscriptionsPort();

export function listActiveWebPushSubscriptionsForIntegrator(
  userId: string,
): Promise<WebPushSubscriptionPayloadV1[]> {
  return webPushSubscriptionsPort.listActiveByUserId(userId);
}

export function deleteWebPushSubscriptionByEndpointForIntegrator(endpoint: string): Promise<boolean> {
  return webPushSubscriptionsPort.deleteByEndpointIfExists(endpoint);
}
