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

const noOAuthPort: OAuthBindingsPort = {
  listProvidersForUser: vi.fn(),
  findUserByOAuthId: vi.fn().mockResolvedValue(null),
};

describe("resolveUserIdForYandexOAuth", () => {
  beforeEach(() => {
    queryMock.mockReset();
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
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns existing user when OAuth binding exists (skips DB queries)", async () => {
    const oauthPort: OAuthBindingsPort = {
      listProvidersForUser: vi.fn(),
      findUserByOAuthId: vi.fn().mockResolvedValue({ userId: "bound-1" }),
    };
    const r = await resolveUserIdForYandexOAuth(oauthPort, {
      yandexId: "y1",
      email: "a@yandex.ru",
      displayName: "A",
      phone: "+79001234567",
    });
    expect(r).toEqual({ ok: true, userId: "bound-1" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("merges to existing user by phone_normalized (primary path)", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "phone-user" }] }) // SELECT phone
      .mockResolvedValueOnce({ rows: [] });                     // INSERT binding

    const r = await resolveUserIdForYandexOAuth(noOAuthPort, {
      yandexId: "y-new",
      email: "a@yandex.ru",
      displayName: "A",
      phone: "+79001234567",
    });

    expect(r).toEqual({ ok: true, userId: "phone-user" });
    expect(queryMock).toHaveBeenCalledTimes(2);
    const firstSql = queryMock.mock.calls[0]?.[0] as string;
    expect(firstSql).toContain("phone_normalized");
    const secondSql = queryMock.mock.calls[1]?.[0] as string;
    expect(secondSql).toContain("user_oauth_bindings");
  });

  it("merges to existing user by verified email when phone absent (fallback)", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "email-user" }] }) // SELECT email
      .mockResolvedValueOnce({ rows: [] });                     // INSERT binding

    const r = await resolveUserIdForYandexOAuth(noOAuthPort, {
      yandexId: "y-new",
      email: "merge@example.com",
      displayName: "Merge",
      phone: null,
    });

    expect(r).toEqual({ ok: true, userId: "email-user" });
    expect(queryMock).toHaveBeenCalledTimes(2);
    const firstSql = queryMock.mock.calls[0]?.[0] as string;
    expect(firstSql).toContain("email_verified_at");
    const secondSql = queryMock.mock.calls[1]?.[0] as string;
    expect(secondSql).toContain("user_oauth_bindings");
  });

  it("creates new user with phone and email when no merge match", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })                      // SELECT phone (not found)
      .mockResolvedValueOnce({ rows: [] })                      // SELECT email (not found)
      .mockResolvedValueOnce({ rows: [{ id: "new-id" }] })      // INSERT user
      .mockResolvedValueOnce({ rows: [] });                     // INSERT binding

    const r = await resolveUserIdForYandexOAuth(noOAuthPort, {
      yandexId: "y-brand",
      email: "new@example.com",
      displayName: "New User",
      phone: "+79001234568",
    });

    expect(r).toEqual({ ok: true, userId: "new-id" });
    expect(queryMock).toHaveBeenCalledTimes(4);
    const insertSql = queryMock.mock.calls[2]?.[0] as string;
    expect(insertSql).toContain("phone_normalized");
  });

  it("creates new user with email only (no phone) when no merge match", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })                      // SELECT email (not found)
      .mockResolvedValueOnce({ rows: [{ id: "new-email-id" }] }) // INSERT user
      .mockResolvedValueOnce({ rows: [] });                     // INSERT binding

    const r = await resolveUserIdForYandexOAuth(noOAuthPort, {
      yandexId: "y-email-only",
      email: "emailonly@example.com",
      displayName: "Email Only",
      phone: null,
    });

    expect(r).toEqual({ ok: true, userId: "new-email-id" });
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it("returns email_ambiguous when multiple verified email rows match", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "a" }, { id: "b" }],
    });

    const r = await resolveUserIdForYandexOAuth(noOAuthPort, {
      yandexId: "y1",
      email: "dup@example.com",
      displayName: "D",
      phone: null,
    });

    expect(r).toEqual({ ok: false, reason: "email_ambiguous" });
  });
});

