import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as oauthYandexResolve from "@/modules/auth/oauthYandexResolve";

const { exchangeYandexCodeMock, fetchYandexUserInfoMock, setSessionMock, findUserMock, findByUserIdMock } = vi.hoisted(
  () => ({
    exchangeYandexCodeMock: vi.fn(),
    fetchYandexUserInfoMock: vi.fn(),
    setSessionMock: vi.fn(),
    findUserMock: vi.fn(),
    findByUserIdMock: vi.fn(),
  }),
);

vi.mock("@/modules/auth/oauthService", () => ({
  exchangeYandexCode: exchangeYandexCodeMock,
  fetchYandexUserInfo: fetchYandexUserInfoMock,
}));

vi.mock("@/modules/auth/service", () => ({
  setSessionFromUser: setSessionMock,
}));

vi.mock("@/modules/auth/redirectPolicy", () => ({
  getRedirectPathForRole: vi.fn().mockReturnValue("/app/patient"),
}));

vi.mock("@/modules/auth/envRole", () => ({
  resolveRoleAsync: vi.fn().mockResolvedValue("client"),
}));

vi.mock("@/infra/repos/pgOAuthBindings", () => ({
  pgOAuthBindingsPort: { listProvidersForUser: vi.fn(), findUserByOAuthId: findUserMock },
}));

vi.mock("@/infra/repos/inMemoryOAuthBindings", () => ({
  inMemoryOAuthBindingsPort: { listProvidersForUser: vi.fn(), findUserByOAuthId: findUserMock },
}));

vi.mock("@/infra/repos/pgUserByPhone", () => ({
  pgUserByPhonePort: { findByUserId: findByUserIdMock },
}));

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getAppBaseUrl: vi.fn().mockResolvedValue("http://localhost"),
  getYandexOauthClientId: vi.fn().mockResolvedValue("test-client-id"),
  getYandexOauthClientSecret: vi.fn().mockResolvedValue("test-client-secret"),
  getYandexOauthRedirectUri: vi.fn().mockResolvedValue("http://localhost/api/auth/oauth/callback/yandex"),
}));

vi.mock("@/config/env", () => ({
  env: {
    DATABASE_URL: "",
    APP_BASE_URL: "http://localhost",
    NODE_ENV: "test",
    SESSION_COOKIE_SECRET: "test-session-secret-16chars",
  },
  isProduction: false,
  webappReposAreInMemory: () => true,
}));

import { createSignedOAuthState } from "@/modules/auth/oauthSignedState";
import { GET } from "./route";
import { GET as GET_YandexPath } from "./yandex/route";

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/auth/oauth/callback/yandex");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

function validYandexState(): string {
  return createSignedOAuthState("yandex", 600);
}

describe("GET /api/auth/oauth/callback/yandex — signed state (legacy /callback delegates here)", () => {
  beforeEach(() => {
    exchangeYandexCodeMock.mockReset();
    fetchYandexUserInfoMock.mockReset();
    setSessionMock.mockReset();
    findUserMock.mockReset();
    findByUserIdMock.mockReset();
  });

  it("returns 403 when query state is absent", async () => {
    const res = await GET(makeRequest({ code: "abc" }));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("oauth_csrf");
  });

  it("returns 403 when state is not a valid signed token", async () => {
    const res = await GET(makeRequest({ code: "abc", state: "not-a-token" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when state is for another OAuth flow (wrong purpose)", async () => {
    const gcalState = createSignedOAuthState("gcal", 600);
    const res = await GET(makeRequest({ code: "abc", state: gcalState }));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/auth/oauth/callback/yandex — post-CSRF flow", () => {
  beforeEach(() => {
    exchangeYandexCodeMock.mockReset();
    fetchYandexUserInfoMock.mockReset();
    setSessionMock.mockReset();
    findUserMock.mockReset();
    findByUserIdMock.mockReset();
  });

  it("redirects oauth=error when no code provided", async () => {
    const res = await GET(makeRequest({ state: validYandexState() }));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("oauth=error");
    expect(loc).toContain("no_code");
  });

  it("redirects oauth=error when exchange fails", async () => {
    exchangeYandexCodeMock.mockRejectedValue(new Error("yandex_token_exchange_failed: 400"));
    const res = await GET(makeRequest({ code: "bad-code", state: validYandexState() }));
    expect(res.status).toBeGreaterThanOrEqual(300);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("exchange_failed");
  });

  it("redirects oauth=error when user info fetch fails", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok" });
    fetchYandexUserInfoMock.mockRejectedValue(new Error("yandex_userinfo_failed: 401"));
    const res = await GET(makeRequest({ code: "code", state: validYandexState() }));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("userinfo_failed");
  });

  it("redirects oauth=error when Yandex did not return identity (no phone, no email)", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok" });
    fetchYandexUserInfoMock.mockResolvedValue({ id: "y1", email: null, phone: null, name: "X" });
    findUserMock.mockResolvedValue(null);
    const res = await GET(makeRequest({ code: "code", state: validYandexState() }));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("no_identity");
  });

  it("redirects db_error when OAuth user not bound and DB unavailable (no merge/create)", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok" });
    fetchYandexUserInfoMock.mockResolvedValue({ id: "y1", email: "u@example.com", phone: null, name: "X" });
    findUserMock.mockResolvedValue(null);
    const res = await GET(makeRequest({ code: "code", state: validYandexState() }));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("db_error");
  });

  it("valid flow: user with phone — sets session and redirects to app", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok123" });
    fetchYandexUserInfoMock.mockResolvedValue({ id: "ya-1", email: "user@ya.ru", phone: "+79990001122", name: "Иван" });
    findUserMock.mockResolvedValue({ userId: "platform-user-uuid" });
    findByUserIdMock.mockResolvedValue({
      userId: "platform-user-uuid",
      role: "client",
      displayName: "Prev",
      phone: "+79990001122",
      bindings: {},
    });
    setSessionMock.mockResolvedValue(undefined);

    const res = await GET(makeRequest({ code: "valid-code", state: validYandexState() }));

    expect(setSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "platform-user-uuid",
        displayName: "Иван",
        role: "client",
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/app/patient");
    expect(loc).not.toContain("bind-phone");
  });

  it("valid flow: user without phone — sets session and redirects to bind-phone", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok456" });
    fetchYandexUserInfoMock.mockResolvedValue({ id: "ya-2", email: "nophone@ya.ru", phone: null, name: "Мария" });
    findUserMock.mockResolvedValue({ userId: "nophone-user-uuid" });
    findByUserIdMock.mockResolvedValue({
      userId: "nophone-user-uuid",
      role: "client",
      displayName: "Мария",
      phone: undefined,
      bindings: {},
    });
    setSessionMock.mockResolvedValue(undefined);

    const res = await GET(makeRequest({ code: "code-nophone", state: validYandexState() }));

    expect(setSessionMock).toHaveBeenCalled();
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("bind-phone");
    expect(loc).toContain("reason=oauth_phone_required");
    expect(loc).toContain("next=");
  });

  it("redirects oauth=error when session creation throws", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok" });
    fetchYandexUserInfoMock.mockResolvedValue({ id: "ya-err", email: "a@ya.ru", phone: null, name: null });
    findUserMock.mockResolvedValue({ userId: "uid-2" });
    findByUserIdMock.mockResolvedValue({
      userId: "uid-2",
      role: "client",
      displayName: "U",
      phone: "+79990001122",
      bindings: {},
    });
    setSessionMock.mockRejectedValue(new Error("cookies_api_unavailable"));

    const res = await GET(makeRequest({ code: "code2", state: validYandexState() }));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("session_failed");
  });
});

describe("GET /api/auth/oauth/callback/yandex — resolveUserIdForYandexOAuth orchestration (spied)", () => {
  let resolveSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exchangeYandexCodeMock.mockReset();
    fetchYandexUserInfoMock.mockReset();
    setSessionMock.mockReset();
    findUserMock.mockReset();
    findByUserIdMock.mockReset();
    resolveSpy = vi.spyOn(oauthYandexResolve, "resolveUserIdForYandexOAuth");
  });

  afterEach(() => {
    resolveSpy.mockRestore();
  });

  it("redirects email_ambiguous when resolver returns that reason", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok" });
    fetchYandexUserInfoMock.mockResolvedValue({ id: "ya-merge", email: "dup@ya.ru", phone: null, name: "D" });
    resolveSpy.mockResolvedValue({ ok: false, reason: "email_ambiguous" });

    const res = await GET(makeRequest({ code: "code", state: validYandexState() }));

    expect(resolveSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        yandexId: "ya-merge",
        email: "dup@ya.ru",
        displayName: "D",
        phone: null,
      }),
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("email_ambiguous");
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("happy path: merge userId from resolver loads platform user and sets session", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok" });
    fetchYandexUserInfoMock.mockResolvedValue({ id: "ya-new", email: "new@ya.ru", phone: "+79990003344", name: "Новый" });
    resolveSpy.mockResolvedValue({ ok: true, userId: "merged-platform-uuid" });
    findByUserIdMock.mockResolvedValue({
      userId: "merged-platform-uuid",
      role: "client",
      displayName: "Old",
      phone: "+79990003344",
      bindings: {},
    });
    setSessionMock.mockResolvedValue(undefined);

    const res = await GET(makeRequest({ code: "code", state: validYandexState() }));

    expect(resolveSpy).toHaveBeenCalled();
    expect(findByUserIdMock).toHaveBeenCalledWith("merged-platform-uuid");
    expect(setSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "merged-platform-uuid",
        displayName: "Новый",
      }),
    );
    expect(res.headers.get("location") ?? "").toContain("/app/patient");
  });
});

describe("Yandex OAuth callback path: legacy vs canonical", () => {
  beforeEach(() => {
    exchangeYandexCodeMock.mockReset();
    fetchYandexUserInfoMock.mockReset();
    setSessionMock.mockReset();
    findUserMock.mockReset();
    findByUserIdMock.mockReset();
  });

  it("legacy GET /api/auth/oauth/callback matches canonical /callback/yandex for CSRF 403", async () => {
    const legacyUrl = new URL("http://localhost/api/auth/oauth/callback");
    legacyUrl.searchParams.set("code", "x");
    legacyUrl.searchParams.set("state", "bad");
    const canonUrl = new URL("http://localhost/api/auth/oauth/callback/yandex");
    canonUrl.searchParams.set("code", "x");
    canonUrl.searchParams.set("state", "bad");

    const rLegacy = await GET(new Request(legacyUrl.toString()));
    const rCanon = await GET_YandexPath(new Request(canonUrl.toString()));

    expect(rLegacy.status).toBe(403);
    expect(rCanon.status).toBe(403);
  });
});
