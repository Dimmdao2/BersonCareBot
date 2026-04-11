import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import {
  exchangeGoogleCode,
  refreshGoogleAccessToken,
  fetchGoogleCalendarList,
  fetchGoogleUserEmail,
  fetchGoogleUserProfile,
} from "./googleOAuthHelpers";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exchangeGoogleCode", () => {
  const opts = { clientId: "cid", clientSecret: "csec", redirectUri: "http://localhost/cb" };

  it("returns tokens on 200", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: "at", refresh_token: "rt" }));
    const result = await exchangeGoogleCode("code123", opts);
    expect(result).toEqual({ accessToken: "at", refreshToken: "rt" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on HTTP error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "invalid_grant" }, 400));
    await expect(exchangeGoogleCode("bad", opts)).rejects.toThrow("google_token_exchange_failed: 400");
  });

  it("throws when access_token is missing in response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ refresh_token: "rt" }));
    await expect(exchangeGoogleCode("code", opts)).rejects.toThrow("google_token_missing_access_token");
  });

  it("returns null refreshToken when not present", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: "at" }));
    const result = await exchangeGoogleCode("code", opts);
    expect(result.refreshToken).toBeNull();
  });
});

describe("refreshGoogleAccessToken", () => {
  const opts = { clientId: "cid", clientSecret: "csec", refreshToken: "rt" };

  it("returns access token on 200", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: "new-at" }));
    const result = await refreshGoogleAccessToken(opts);
    expect(result).toBe("new-at");
  });

  it("throws on HTTP error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "invalid_grant" }, 401));
    await expect(refreshGoogleAccessToken(opts)).rejects.toThrow("google_refresh_failed: 401");
  });

  it("throws when access_token is missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await expect(refreshGoogleAccessToken(opts)).rejects.toThrow("google_refresh_missing_access_token");
  });
});

describe("fetchGoogleCalendarList", () => {
  it("returns calendars on 200", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          { id: "cal1", summary: "Main", primary: true },
          { id: "cal2", summary: "Work" },
        ],
      }),
    );
    const result = await fetchGoogleCalendarList("tok");
    expect(result).toEqual([
      { id: "cal1", summary: "Main", primary: true },
      { id: "cal2", summary: "Work", primary: false },
    ]);
  });

  it("returns empty array when items missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await fetchGoogleCalendarList("tok");
    expect(result).toEqual([]);
  });

  it("throws on 401", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401));
    await expect(fetchGoogleCalendarList("tok")).rejects.toThrow("google_calendar_list_failed: 401");
  });
});

describe("fetchGoogleUserProfile", () => {
  it("returns sub, email, name and emailVerified from userinfo", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: "109876",
        email: "u@gmail.com",
        name: "User",
        verified_email: true,
      }),
    );
    const result = await fetchGoogleUserProfile("tok");
    expect(result).toEqual({
      sub: "109876",
      email: "u@gmail.com",
      name: "User",
      emailVerified: true,
    });
  });

  it("sets emailVerified false when Google did not confirm email", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: "109876",
        email: "u@gmail.com",
        verified_email: false,
      }),
    );
    const result = await fetchGoogleUserProfile("tok");
    expect(result?.emailVerified).toBe(false);
  });

  it("returns null when id missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ email: "a@b.c" }));
    const result = await fetchGoogleUserProfile("tok");
    expect(result).toBeNull();
  });
});

describe("fetchGoogleUserEmail", () => {
  it("returns email on 200", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ email: "user@gmail.com" }));
    const result = await fetchGoogleUserEmail("tok");
    expect(result).toBe("user@gmail.com");
  });

  it("returns null on error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 401));
    const result = await fetchGoogleUserEmail("tok");
    expect(result).toBeNull();
  });

  it("returns null on fetch failure", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const result = await fetchGoogleUserEmail("tok");
    expect(result).toBeNull();
  });
});
