import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveUserIdForYandexOAuth } from "./oauthYandexResolve";
import type { OAuthBindingsPort } from "./oauthBindingsPort";

const queryMock = vi.fn();

vi.mock("@/config/env", () => ({
  env: { DATABASE_URL: "postgres://test/db" },
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    query: (...args: unknown[]) => queryMock(...(args as [string, unknown[]])),
  }),
}));

describe("resolveUserIdForYandexOAuth", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns no_verified_email when email is missing", async () => {
    const oauthPort: OAuthBindingsPort = {
      listProvidersForUser: vi.fn(),
      findUserByOAuthId: vi.fn().mockResolvedValue(null),
    };
    const r = await resolveUserIdForYandexOAuth(oauthPort, {
      yandexId: "y1",
      email: null,
      displayName: "X",
    });
    expect(r).toEqual({ ok: false, reason: "no_verified_email" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns existing user when OAuth binding exists", async () => {
    const oauthPort: OAuthBindingsPort = {
      listProvidersForUser: vi.fn(),
      findUserByOAuthId: vi.fn().mockResolvedValue({ userId: "bound-1" }),
    };
    const r = await resolveUserIdForYandexOAuth(oauthPort, {
      yandexId: "y1",
      email: "a@yandex.ru",
      displayName: "A",
    });
    expect(r).toEqual({ ok: true, userId: "bound-1" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("merges to existing verified-email user and upserts binding", async () => {
    const oauthPort: OAuthBindingsPort = {
      listProvidersForUser: vi.fn(),
      findUserByOAuthId: vi.fn().mockResolvedValue(null),
    };
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "merge-user" }] })
      .mockResolvedValueOnce({ rows: [] });

    const r = await resolveUserIdForYandexOAuth(oauthPort, {
      yandexId: "y-new",
      email: "merge@example.com",
      displayName: "Merge",
    });

    expect(r).toEqual({ ok: true, userId: "merge-user" });
    expect(queryMock).toHaveBeenCalledTimes(2);
    const secondSql = queryMock.mock.calls[1]?.[0] as string;
    expect(secondSql).toContain("user_oauth_bindings");
  });

  it("creates platform user when no merge match", async () => {
    const oauthPort: OAuthBindingsPort = {
      listProvidersForUser: vi.fn(),
      findUserByOAuthId: vi.fn().mockResolvedValue(null),
    };
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "new-id" }] })
      .mockResolvedValueOnce({ rows: [] });

    const r = await resolveUserIdForYandexOAuth(oauthPort, {
      yandexId: "y-brand",
      email: "new@example.com",
      displayName: "New User",
    });

    expect(r).toEqual({ ok: true, userId: "new-id" });
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it("returns email_ambiguous when multiple verified rows match", async () => {
    const oauthPort: OAuthBindingsPort = {
      listProvidersForUser: vi.fn(),
      findUserByOAuthId: vi.fn().mockResolvedValue(null),
    };
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "a" }, { id: "b" }],
    });

    const r = await resolveUserIdForYandexOAuth(oauthPort, {
      yandexId: "y1",
      email: "dup@example.com",
      displayName: "D",
    });

    expect(r).toEqual({ ok: false, reason: "email_ambiguous" });
  });
});
