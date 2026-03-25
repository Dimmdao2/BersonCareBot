import type { OauthProvider, OAuthBindingsPort } from "@/modules/auth/oauthBindingsPort";

const byUser = new Map<string, Set<OauthProvider>>();
/** provider → providerUserId → userId */
const byOAuthId = new Map<string, string>();

function oauthKey(provider: OauthProvider, providerUserId: string): string {
  return `${provider}:${providerUserId}`;
}

export const inMemoryOAuthBindingsPort: OAuthBindingsPort = {
  async listProvidersForUser(userId: string): Promise<OauthProvider[]> {
    const s = byUser.get(userId);
    return s ? [...s] : [];
  },

  async findUserByOAuthId(provider: OauthProvider, providerUserId: string): Promise<{ userId: string } | null> {
    const userId = byOAuthId.get(oauthKey(provider, providerUserId));
    return userId ? { userId } : null;
  },
};

/** Только для тестов: привязать провайдера пользователю. */
export function __testSetOauthProviders(userId: string, providers: OauthProvider[]): void {
  byUser.set(userId, new Set(providers));
}

/** Только для тестов: зарегистрировать OAuth-привязку (provider → userId). */
export function __testSetOauthBinding(provider: OauthProvider, providerUserId: string, userId: string): void {
  byOAuthId.set(oauthKey(provider, providerUserId), userId);
  const s = byUser.get(userId) ?? new Set<OauthProvider>();
  s.add(provider);
  byUser.set(userId, s);
}
