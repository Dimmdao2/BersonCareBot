export type OauthProvider = "google" | "apple" | "yandex";

export type OAuthBindingsPort = {
  listProvidersForUser(userId: string): Promise<OauthProvider[]>;
  /** Найти userId по привязке OAuth-провайдера. Возвращает null если привязки нет. */
  findUserByOAuthId(provider: OauthProvider, providerUserId: string): Promise<{ userId: string } | null>;
};
