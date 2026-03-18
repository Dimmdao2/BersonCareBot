import type { SessionUser } from "@/shared/types/session";
import type { IdentityResolutionPort } from "@/modules/auth/identityResolutionPort";

function toBindingKey(channelCode: "telegram" | "max" | "vk"): keyof SessionUser["bindings"] {
  if (channelCode === "telegram") return "telegramId";
  if (channelCode === "max") return "maxId";
  return "vkId";
}

/**
 * In-memory identity resolution: returns a session user from binding only (no persistence).
 * Used when DATABASE_URL is not set; userId is channel-prefixed external id.
 */
export const inMemoryIdentityResolutionPort: IdentityResolutionPort = {
  async findOrCreateByChannelBinding(params): Promise<SessionUser> {
    const key = toBindingKey(params.channelCode);
    const bindings: SessionUser["bindings"] = {};
    (bindings as Record<string, string>)[key] = params.externalId;
    return {
      userId: `${params.channelCode}:${params.externalId}`,
      role: params.role ?? "client",
      displayName: params.displayName ?? params.externalId,
      bindings,
    };
  },

  async findByChannelBinding(params): Promise<SessionUser | null> {
    return this.findOrCreateByChannelBinding(params);
  },
};
