import { describe, expect, it, vi, beforeEach } from "vitest";

const { exchangeYandexCodeMock, fetchYandexUserInfoMock, setSessionMock, findUserMock } = vi.hoisted(() => ({
  exchangeYandexCodeMock: vi.fn(),
  fetchYandexUserInfoMock: vi.fn(),
  setSessionMock: vi.fn(),
  findUserMock: vi.fn(),
}));

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
  resolveRoleFromEnv: vi.fn().mockReturnValue("client"),
}));

vi.mock("@/infra/repos/pgOAuthBindings", () => ({
  pgOAuthBindingsPort: { listProvidersForUser: vi.fn(), findUserByOAuthId: findUserMock },
}));

vi.mock("@/infra/repos/inMemoryOAuthBindings", () => ({
  inMemoryOAuthBindingsPort: { listProvidersForUser: vi.fn(), findUserByOAuthId: findUserMock },
}));

// Mock env with Yandex configured so all paths are reachable in one test file.
vi.mock("@/config/env", () => ({
  env: {
    YANDEX_OAUTH_CLIENT_ID: "test-client-id",
    YANDEX_OAUTH_CLIENT_SECRET: "test-client-secret",
    YANDEX_OAUTH_REDIRECT_URI: "http://localhost/api/auth/oauth/callback",
    DATABASE_URL: "",
    APP_BASE_URL: "http://localhost",
    NODE_ENV: "test",
  },
  isProduction: false,
}));

import { GET } from "./route";

const STATE = "test-state-uuid-1234";

function makeRequest(params: Record<string, string>, cookieState?: string): Request {
  const url = new URL("http://localhost/api/auth/oauth/callback");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {};
  if (cookieState !== undefined) {
    headers["cookie"] = `oauth_state_yandex=${cookieState}`;
  }
  return new Request(url.toString(), { headers });
}

describe("GET /api/auth/oauth/callback — CSRF state", () => {
  beforeEach(() => {
    exchangeYandexCodeMock.mockReset();
    fetchYandexUserInfoMock.mockReset();
    setSessionMock.mockReset();
    findUserMock.mockReset();
  });

  it("returns 403 when no cookie and no query state", async () => {
    const res = await GET(makeRequest({ code: "abc" }));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("oauth_csrf");
  });

  it("returns 403 when cookie is set but query state is absent", async () => {
    const res = await GET(makeRequest({ code: "abc" }, STATE));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("oauth_csrf");
  });

  it("returns 403 when query state is set but cookie is absent", async () => {
    const res = await GET(makeRequest({ code: "abc", state: STATE }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when state mismatch (cookie != query)", async () => {
    const res = await GET(makeRequest({ code: "abc", state: "different-state" }, STATE));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/auth/oauth/callback — post-CSRF flow", () => {
  beforeEach(() => {
    exchangeYandexCodeMock.mockReset();
    fetchYandexUserInfoMock.mockReset();
    setSessionMock.mockReset();
    findUserMock.mockReset();
  });

  it("redirects oauth=error when no code provided", async () => {
    const res = await GET(makeRequest({ state: STATE }, STATE));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("oauth=error");
    expect(loc).toContain("no_code");
  });

  it("redirects oauth=error when exchange fails", async () => {
    exchangeYandexCodeMock.mockRejectedValue(new Error("yandex_token_exchange_failed: 400"));
    const res = await GET(makeRequest({ code: "bad-code", state: STATE }, STATE));
    expect(res.status).toBeGreaterThanOrEqual(300);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("exchange_failed");
  });

  it("redirects oauth=error when user info fetch fails", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok" });
    fetchYandexUserInfoMock.mockRejectedValue(new Error("yandex_userinfo_failed: 401"));
    const res = await GET(makeRequest({ code: "code", state: STATE }, STATE));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("userinfo_failed");
  });

  it("redirects oauth=error when user not linked", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok" });
    fetchYandexUserInfoMock.mockResolvedValue({ id: "y1", email: "u@example.com", name: "X" });
    findUserMock.mockResolvedValue(null);
    const res = await GET(makeRequest({ code: "code", state: STATE }, STATE));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("user_not_linked");
  });

  it("valid flow: creates session and redirects when user found", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok123" });
    fetchYandexUserInfoMock.mockResolvedValue({ id: "ya-1", email: "user@ya.ru", name: "Иван" });
    findUserMock.mockResolvedValue({ userId: "platform-user-uuid" });
    setSessionMock.mockResolvedValue(undefined);

    const res = await GET(makeRequest({ code: "valid-code", state: STATE }, STATE));

    expect(setSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "platform-user-uuid",
        displayName: "Иван",
      })
    );
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/app/patient");
  });

  it("redirects oauth=error when session creation throws", async () => {
    exchangeYandexCodeMock.mockResolvedValue({ accessToken: "tok" });
    fetchYandexUserInfoMock.mockResolvedValue({ id: "ya-2", email: null, name: null });
    findUserMock.mockResolvedValue({ userId: "uid-2" });
    setSessionMock.mockRejectedValue(new Error("cookies_api_unavailable"));

    const res = await GET(makeRequest({ code: "code2", state: STATE }, STATE));
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("session_failed");
  });
});
