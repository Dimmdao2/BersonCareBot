import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveUserIdForYandexOAuth } from "./oauthYandexResolve";
import type { OAuthBindingsPort } from "./oauthBindingsPort";
import { bindOAuthUserResolvePort } from "./oauthUserResolvePort";
import type { OAuthUserResolvePort } from "./oauthUserResolvePort";

vi.mock("@/config/env", () => ({
  env: { DATABASE_URL: "postgres://test/db" },
}));

const oauthResolveMock: OAuthUserResolvePort = {
  findCanonicalUserIdByPhone: vi.fn().mockResolvedValue(null),
  resolveCanonicalUserId: vi.fn().mockImplementation(async (userId) => userId),
  applyVerifiedOAuthEmail: vi.fn().mockResolvedValue(undefined),
  findUserIdsByVerifiedEmail: vi.fn().mockResolvedValue([]),
  findActiveUserIdsByEmail: vi.fn().mockResolvedValue([]),
  createOAuthPlatformUser: vi.fn().mockResolvedValue("new-yandex-id"),
  upsertOAuthBinding: vi.fn().mockResolvedValue({ inserted: true }),
};

const noOAuthPort: OAuthBindingsPort = {
  listProvidersForUser: vi.fn(),
  findUserByOAuthId: vi.fn().mockResolvedValue(null),
};

describe("resolveUserIdForYandexOAuth", () => {
  beforeEach(() => {
    bindOAuthUserResolvePort(oauthResolveMock);
    vi.mocked(oauthResolveMock.findCanonicalUserIdByPhone).mockReset().mockResolvedValue(null);
    vi.mocked(oauthResolveMock.resolveCanonicalUserId).mockReset().mockImplementation(async (userId) => userId);
    vi.mocked(oauthResolveMock.applyVerifiedOAuthEmail).mockReset().mockResolvedValue(undefined);
    vi.mocked(oauthResolveMock.findUserIdsByVerifiedEmail).mockReset().mockResolvedValue([]);
    vi.mocked(oauthResolveMock.findActiveUserIdsByEmail).mockReset().mockResolvedValue([]);
    vi.mocked(oauthResolveMock.createOAuthPlatformUser).mockReset().mockResolvedValue("new-yandex-id");
    vi.mocked(oauthResolveMock.upsertOAuthBinding).mockReset().mockResolvedValue({ inserted: true });
    vi.mocked(noOAuthPort.findUserByOAuthId).mockResolvedValue(null);
  });

  it("returns no_identity when neither phone nor email", async () => {
    const r = await resolveUserIdForYandexOAuth(noOAuthPort, {
      yandexId: "y1",
      email: null,
      displayName: "X",
      phone: null,
    });
    expect(r).toEqual({ ok: false, reason: "no_identity" });
  });

  it("creates user when no merge match", async () => {
    const r = await resolveUserIdForYandexOAuth(noOAuthPort, {
      yandexId: "y2",
      email: "new@example.com",
      displayName: "New",
      phone: null,
    });

    expect(r).toEqual({ ok: true, userId: "new-yandex-id", accountOutcome: "created" });
    expect(oauthResolveMock.createOAuthPlatformUser).toHaveBeenCalled();
    expect(oauthResolveMock.upsertOAuthBinding).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "yandex", providerUserId: "y2" }),
    );
  });

  it("returns email_ambiguous when multiple verified email rows match", async () => {
    vi.mocked(oauthResolveMock.findUserIdsByVerifiedEmail).mockResolvedValue(["a", "b"]);

    const r = await resolveUserIdForYandexOAuth(noOAuthPort, {
      yandexId: "y3",
      email: "dup@example.com",
      displayName: "D",
      phone: null,
    });

    expect(r).toEqual({ ok: false, reason: "email_ambiguous" });
  });

  // Bug 1 (prod): existing active account owns the email but UNVERIFIED (phone/booking-created).
  it("links to an existing account whose email is UNVERIFIED instead of inserting a duplicate", async () => {
    vi.mocked(oauthResolveMock.findUserIdsByVerifiedEmail).mockResolvedValue([]);
    vi.mocked(oauthResolveMock.findActiveUserIdsByEmail).mockResolvedValue(["phone-created-user"]);

    const r = await resolveUserIdForYandexOAuth(noOAuthPort, {
      yandexId: "y9",
      email: "existing@example.com",
      displayName: "Existing",
      phone: null,
    });

    expect(r).toEqual({ ok: true, userId: "phone-created-user", accountOutcome: "linked_existing" });
    expect(oauthResolveMock.createOAuthPlatformUser).not.toHaveBeenCalled();
    expect(oauthResolveMock.upsertOAuthBinding).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "phone-created-user", provider: "yandex" }),
    );
  });

  it("links existing OAuth binding and applies verified email", async () => {
    vi.mocked(noOAuthPort.findUserByOAuthId).mockResolvedValue({ userId: "existing-id" });

    const r = await resolveUserIdForYandexOAuth(noOAuthPort, {
      yandexId: "y4",
      email: "keep@example.com",
      displayName: "E",
      phone: null,
    });

    expect(r).toEqual({ ok: true, userId: "existing-id", accountOutcome: "linked_existing" });
    expect(oauthResolveMock.applyVerifiedOAuthEmail).toHaveBeenCalledWith(
      "existing-id",
      "keep@example.com",
      true,
    );
  });
});
