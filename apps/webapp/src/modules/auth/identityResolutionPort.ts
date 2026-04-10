import type { SessionUser } from "@/shared/types/session";

/**
 * Optional hints from a signed integrator webapp-entry token (`?t=`), Mini App `start_param`, or Login Widget `webappEntryToken`.
 * Used to attach a new channel binding to an existing canon before inserting a new `platform_users` row.
 * Phone is matched only when the canon already has integrator/trusted projection activation (§5 SPEC).
 */
export type MessengerIdentityResolutionHints = {
  /** JWT `sub` when it is a `platform_users.id` UUID (resolved through merge chain). */
  platformUserSub?: string;
  /** E.164; matched only to a canonical user with `patient_phone_trust_at` set (trusted projection / integrator). */
  phoneNormalized?: string;
  /** Optional `integratorUserId` from token (`contracts/webapp-entry-token.json`). */
  integratorUserId?: string;
};

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
    resolutionHints?: MessengerIdentityResolutionHints;
  }): Promise<SessionUser>;
  /** Find existing user by channel binding only; returns null if not found. Used for delivery-targets lookup. */
  findByChannelBinding(params: {
    channelCode: "telegram" | "max" | "vk";
    externalId: string;
  }): Promise<SessionUser | null>;
};
