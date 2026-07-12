import { beforeEach, describe, expect, it, vi } from "vitest";

const getYandexOauthClientIdMock = vi.fn();
const getYandexOauthClientSecretMock = vi.fn();
const getYandexOauthRedirectUriMock = vi.fn();
const getGoogleClientIdMock = vi.fn();
const getGoogleClientSecretMock = vi.fn();
const getGoogleOauthLoginRedirectUriMock = vi.fn();
const getAppleOauthClientIdMock = vi.fn();
const getAppleOauthRedirectUriMock = vi.fn();
const getAppleOauthTeamIdMock = vi.fn();
const getAppleOauthKeyIdMock = vi.fn();
const getAppleOauthPrivateKeyMock = vi.fn();
const getLoginAlternativesPublicConfigMock = vi.fn();
const getSpecialistSignupEnabledMock = vi.fn();

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getYandexOauthClientId: () => getYandexOauthClientIdMock(),
  getYandexOauthClientSecret: () => getYandexOauthClientSecretMock(),
  getYandexOauthRedirectUri: () => getYandexOauthRedirectUriMock(),
  getGoogleClientId: () => getGoogleClientIdMock(),
  getGoogleClientSecret: () => getGoogleClientSecretMock(),
  getGoogleOauthLoginRedirectUri: () => getGoogleOauthLoginRedirectUriMock(),
  getAppleOauthClientId: () => getAppleOauthClientIdMock(),
  getAppleOauthRedirectUri: () => getAppleOauthRedirectUriMock(),
  getAppleOauthTeamId: () => getAppleOauthTeamIdMock(),
  getAppleOauthKeyId: () => getAppleOauthKeyIdMock(),
  getAppleOauthPrivateKey: () => getAppleOauthPrivateKeyMock(),
}));

vi.mock("@/modules/auth/loginAlternativesConfig", () => ({
  getLoginAlternativesPublicConfig: () => getLoginAlternativesPublicConfigMock(),
}));

vi.mock("@/modules/auth/specialistSignupRollout", () => ({
  getSpecialistSignupEnabled: () => getSpecialistSignupEnabledMock(),
}));

import { buildPrefetchedPublicAuthConfig } from "./publicAuthSnapshot";

describe("buildPrefetchedPublicAuthConfig", () => {
  beforeEach(() => {
    getYandexOauthClientIdMock.mockReset();
    getYandexOauthClientSecretMock.mockReset();
    getYandexOauthRedirectUriMock.mockReset();
    getGoogleClientIdMock.mockReset();
    getGoogleClientSecretMock.mockReset();
    getGoogleOauthLoginRedirectUriMock.mockReset();
    getAppleOauthClientIdMock.mockReset();
    getAppleOauthRedirectUriMock.mockReset();
    getAppleOauthTeamIdMock.mockReset();
    getAppleOauthKeyIdMock.mockReset();
    getAppleOauthPrivateKeyMock.mockReset();
    getLoginAlternativesPublicConfigMock.mockReset();
    getSpecialistSignupEnabledMock.mockReset();

    getYandexOauthClientIdMock.mockResolvedValue("");
    getYandexOauthClientSecretMock.mockResolvedValue("");
    getYandexOauthRedirectUriMock.mockResolvedValue("");
    getGoogleClientIdMock.mockResolvedValue("");
    getGoogleClientSecretMock.mockResolvedValue("");
    getGoogleOauthLoginRedirectUriMock.mockResolvedValue("");
    getAppleOauthClientIdMock.mockResolvedValue("");
    getAppleOauthRedirectUriMock.mockResolvedValue("");
    getAppleOauthTeamIdMock.mockResolvedValue("");
    getAppleOauthKeyIdMock.mockResolvedValue("");
    getAppleOauthPrivateKeyMock.mockResolvedValue("");
    getLoginAlternativesPublicConfigMock.mockResolvedValue({
      telegramBotUsername: "test_bot",
      maxBotOpenUrl: "https://max.ru/test_bot",
    });
    getSpecialistSignupEnabledMock.mockResolvedValue(false);
  });

  it("includes specialist signup rollout flag with safe false default", async () => {
    const result = await buildPrefetchedPublicAuthConfig();

    expect(result.specialistSignupEnabled).toBe(false);
    expect(result.telegramBotUsername).toBe("test_bot");
    expect(result.maxBotOpenUrl).toBe("https://max.ru/test_bot");
  });
});
