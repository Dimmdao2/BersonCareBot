import type { OauthProvider, OAuthBindingsPort } from "@/modules/auth/oauthBindingsPort";

const byUser = new Map<string, Set<OauthProvider>>();

export const inMemoryOAuthBindingsPort: OAuthBindingsPort = {
  async listProvidersForUser(userId: string): Promise<OauthProvider[]> {
    const s = byUser.get(userId);
    return s ? [...s] : [];
  },
};

/** Только для тестов: привязать провайдера пользователю. */
export function __testSetOauthProviders(userId: string, providers: OauthProvider[]): void {
  byUser.set(userId, new Set(providers));
}
