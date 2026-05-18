import type { WebPushSubscriptionPayloadV1, WebPushSubscriptionsPort } from "@/modules/web-push/ports";

const MAX_SUBSCRIPTIONS_PER_USER = 5;

const byEndpoint = new Map<
  string,
  { userId: string; subscription: WebPushSubscriptionPayloadV1; userAgent: string | null }
>();

export const inMemoryWebPushSubscriptionsPort: WebPushSubscriptionsPort = {
  async saveSubscription(userId, subscription, options) {
    const ua = options?.userAgent?.trim() ?? null;
    byEndpoint.set(subscription.endpoint, { userId, subscription, userAgent: ua });

    const forUser = Array.from(byEndpoint.entries()).filter(([, v]) => v.userId === userId);
    if (forUser.length > MAX_SUBSCRIPTIONS_PER_USER) {
      const sorted = forUser.sort((a, b) => {
        const ea = a[1].subscription.endpoint;
        const eb = b[1].subscription.endpoint;
        return ea.localeCompare(eb);
      });
      const drop = sorted.slice(0, forUser.length - MAX_SUBSCRIPTIONS_PER_USER);
      for (const [ep] of drop) {
        byEndpoint.delete(ep);
      }
    }
  },

  async removeSubscriptionByEndpoint(userId, endpoint) {
    const cur = byEndpoint.get(endpoint);
    if (cur?.userId === userId) byEndpoint.delete(endpoint);
  },

  async removeSubscriptionsForUser(userId) {
    for (const [ep, v] of byEndpoint.entries()) {
      if (v.userId === userId) byEndpoint.delete(ep);
    }
  },

  async hasAnyForUserId(userId) {
    for (const v of byEndpoint.values()) {
      if (v.userId === userId) return true;
    }
    return false;
  },

  async listActiveByUserId(userId) {
    const out: WebPushSubscriptionPayloadV1[] = [];
    for (const v of byEndpoint.values()) {
      if (v.userId === userId) out.push(v.subscription);
    }
    return out;
  },

  async deleteByEndpointIfExists(endpoint) {
    return byEndpoint.delete(endpoint);
  },
};
