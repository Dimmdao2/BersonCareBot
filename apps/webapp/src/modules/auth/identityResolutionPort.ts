import type { SessionUser } from '@/shared/types/session';
import type { AccountOutcome } from '@/modules/auth/oauthYandexResolve';

export type ResolveByChannelBindingResult = {
  user: SessionUser;
  accountOutcome: AccountOutcome;
};

/**
 * Optional hints from a signed integrator webapp-entry token (`?t=`), Mini App `start_param`, or Login Widget `webappEntryToken`.
 * Used to attach a channel binding to an EXISTING canon. Track D (#987) removed the retired
 * `integratorUserId` hint: every remaining hint names a canonical person directly.
 * Phone is matched only when the canon already has integrator/trusted projection activation (§5 SPEC).
 */
/**
 * Resolves a canonical platform user by channel binding (telegram/max/vk) — resolve-only.
 *
 * Track D (#987): this no longer creates anyone. The owner's rule (`docs/OWNER_DECISIONS.md`,
 * 23.08.2026) is that a bot confirms a phone but never opens an account, and «вызов webapp-owned
 * DB-функции из generic webhook не меняет владельца действия»: a `/start`, message, callback or
 * contact without a live token-bound webapp attempt must leave zero `platform_users` rows. The one
 * account-opening path left in the codebase is webapp's own phone flow (`pgUserByPhone.ts`).
 * `null` here means "no such person" — the caller denies the session instead of inventing one.
 */
export type IdentityResolutionPort = {
  resolveByChannelBinding(params: {
    channelCode: 'telegram' | 'max' | 'vk';
    externalId: string;
    displayName?: string;
    role?: SessionUser['role'];
  }): Promise<ResolveByChannelBindingResult | null>;
  findByChannelBinding(params: {
    channelCode: 'telegram' | 'max' | 'vk';
    externalId: string;
  }): Promise<SessionUser | null>;
};
