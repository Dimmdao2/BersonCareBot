import type { SessionUser } from "@/shared/types/session";

/**
 * Resolves or creates a canonical platform user by channel binding (telegram/max/vk).
 * Used when user enters via messenger ?t= token so session uses stable platform user id.
 */
export type IdentityResolutionPort = {
  findOrCreateByChannelBinding(params: {
    channelCode: "telegram" | "max" | "vk";
    externalId: string;
    displayName?: string;
    role?: SessionUser["role"];
  }): Promise<SessionUser>;
  /** Find existing user by channel binding only; returns null if not found. Used for delivery-targets lookup. */
  findByChannelBinding(params: {
    channelCode: "telegram" | "max" | "vk";
    externalId: string;
  }): Promise<SessionUser | null>;
};
