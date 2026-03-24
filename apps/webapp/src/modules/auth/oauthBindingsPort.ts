export type OauthProvider = "google" | "apple" | "yandex";

export type OAuthBindingsPort = {
  listProvidersForUser(userId: string): Promise<OauthProvider[]>;
};
