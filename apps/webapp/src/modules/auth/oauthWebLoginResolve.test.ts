import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveUserIdForWebOAuthLogin } from "./oauthWebLoginResolve";
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
  createOAuthPlatformUser: vi.fn().mockResolvedValue("oauth-only-id"),
  upsertOAuthBinding: vi.fn().mockResolvedValue({ inserted: true }),
};

const noOAuthPort: OAuthBindingsPort = {
  listProvidersForUser: vi.fn(),
  findUserByOAuthId: vi.fn().mockResolvedValue(null),
};

describe("resolveUserIdForWebOAuthLogin", () => {
  beforeEach(() => {
    bindOAuthUserResolvePort(oauthResolveMock);
    vi.mocked(oauthResolveMock.findCanonicalUserIdByPhone).mockReset().mockResolvedValue(null);
    vi.mocked(oauthResolveMock.resolveCanonicalUserId).mockReset().mockImplementation(async (userId) => userId);
    vi.mocked(oauthResolveMock.applyVerifiedOAuthEmail).mockReset().mockResolvedValue(undefined);
    vi.mocked(oauthResolveMock.findUserIdsByVerifiedEmail).mockReset().mockResolvedValue([]);
    vi.mocked(oauthResolveMock.findActiveUserIdsByEmail).mockReset().mockResolvedValue([]);
    vi.mocked(oauthResolveMock.createOAuthPlatformUser).mockReset().mockResolvedValue("oauth-only-id");
    vi.mocked(oauthResolveMock.upsertOAuthBinding).mockReset().mockResolvedValue({ inserted: true });
    vi.mocked(noOAuthPort.findUserByOAuthId).mockResolvedValue(null);
  });

  it("returns no_identity when providerUserId empty", async () => {
    const r = await resolveUserIdForWebOAuthLogin(noOAuthPort, {
      provider: "google",
      providerUserId: "   ",
      email: "a@gmail.com",
      emailVerified: true,
      displayName: "A",
      phone: null,
    });
    expect(r).toEqual({ ok: false, reason: "no_identity" });
  });

  it("creates user with verified email when no merge match", async () => {
    const r = await resolveUserIdForWebOAuthLogin(noOAuthPort, {
      provider: "google",
      providerUserId: "google-sub-1",
      email: "new@gmail.com",
      emailVerified: true,
      displayName: "New",
      phone: null,
    });

    expect(r).toEqual({ ok: true, userId: "oauth-only-id", accountOutcome: "created" });
    expect(oauthResolveMock.findUserIdsByVerifiedEmail).toHaveBeenCalledWith("new@gmail.com");
    expect(oauthResolveMock.createOAuthPlatformUser).toHaveBeenCalledWith(
      expect.objectContaining({ emailRaw: "new@gmail.com" }),
    );
  });

  it("does not merge by unverified email", async () => {
    const r = await resolveUserIdForWebOAuthLogin(noOAuthPort, {
      provider: "apple",
      providerUserId: "apple-sub-1",
      email: "maybe@gmail.com",
      emailVerified: false,
      displayName: null,
      phone: null,
    });

    expect(r).toEqual({ ok: true, userId: "oauth-only-id", accountOutcome: "created" });
    expect(oauthResolveMock.findUserIdsByVerifiedEmail).not.toHaveBeenCalled();
    expect(oauthResolveMock.createOAuthPlatformUser).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerifiedAt: null }),
    );
  });

  it("returns email_ambiguous when multiple verified email rows match", async () => {
    vi.mocked(oauthResolveMock.findUserIdsByVerifiedEmail).mockResolvedValue(["a", "b"]);

    const r = await resolveUserIdForWebOAuthLogin(noOAuthPort, {
      provider: "google",
      providerUserId: "g1",
      email: "dup@example.com",
      emailVerified: true,
      displayName: "D",
      phone: null,
    });

    expect(r).toEqual({ ok: false, reason: "email_ambiguous" });
  });

  // Bug 1 (prod): existing active account owns the email but UNVERIFIED (phone/booking-created).
  // The verified-email lookup misses it → previously fell through to INSERT → duplicate-key crash.
  it("links to an existing account whose email is UNVERIFIED instead of inserting a duplicate", async () => {
    vi.mocked(oauthResolveMock.findUserIdsByVerifiedEmail).mockResolvedValue([]);
    vi.mocked(oauthResolveMock.findActiveUserIdsByEmail).mockResolvedValue(["phone-created-user"]);

    const r = await resolveUserIdForWebOAuthLogin(noOAuthPort, {
      provider: "google",
      providerUserId: "google-sub-9",
      email: "existing@gmail.com",
      emailVerified: true,
      displayName: "Existing",
      phone: null,
    });

    expect(r).toEqual({ ok: true, userId: "phone-created-user", accountOutcome: "linked_existing" });
    expect(oauthResolveMock.createOAuthPlatformUser).not.toHaveBeenCalled();
    expect(oauthResolveMock.upsertOAuthBinding).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "phone-created-user", provider: "google" }),
    );
    expect(oauthResolveMock.applyVerifiedOAuthEmail).toHaveBeenCalledWith(
      "phone-created-user",
      "existing@gmail.com",
      true,
    );
  });

  it("returns email_ambiguous when multiple active (any-verification) email rows match", async () => {
    vi.mocked(oauthResolveMock.findActiveUserIdsByEmail).mockResolvedValue(["a", "b"]);

    const r = await resolveUserIdForWebOAuthLogin(noOAuthPort, {
      provider: "google",
      providerUserId: "g2",
      email: "dup2@example.com",
      emailVerified: true,
      displayName: "D",
      phone: null,
    });

    expect(r).toEqual({ ok: false, reason: "email_ambiguous" });
  });
});
