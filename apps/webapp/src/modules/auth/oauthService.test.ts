import { describe, expect, it, vi } from "vitest";
import { exchangeYandexCode, fetchYandexUserInfo } from "./oauthService";

const CREDS = {
  clientId: "cid",
  clientSecret: "csec",
  redirectUri: "http://localhost/callback",
};

describe("exchangeYandexCode", () => {
  it("returns accessToken on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "tok-abc", token_type: "bearer" }),
    } as Response);

    const result = await exchangeYandexCode("code123", CREDS, mockFetch);
    expect(result.accessToken).toBe("tok-abc");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://oauth.yandex.ru/token",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws on non-ok HTTP response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 400 } as Response);
    await expect(exchangeYandexCode("bad", CREDS, mockFetch)).rejects.toThrow(
      "yandex_token_exchange_failed"
    );
  });

  it("throws when access_token missing in response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: "invalid_client" }),
    } as Response);
    await expect(exchangeYandexCode("bad", CREDS, mockFetch)).rejects.toThrow(
      "yandex_no_access_token"
    );
  });

  it("throws on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(exchangeYandexCode("code", CREDS, mockFetch)).rejects.toThrow(
      "yandex_token_network_error"
    );
  });
});

describe("fetchYandexUserInfo", () => {
  it("returns id, email, name and phone on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "ya-user-1",
        login: "yalogin",
        real_name: "Иван Иванов",
        default_email: "ivan@yandex.ru",
        default_phone: { id: 12345678, number: "+79037659418" },
      }),
    } as Response);

    const info = await fetchYandexUserInfo("tok", mockFetch);
    expect(info.id).toBe("ya-user-1");
    expect(info.email).toBe("ivan@yandex.ru");
    expect(info.name).toBe("Иван Иванов");
    expect(info.phone).toBe("+79037659418");
  });

  it("returns phone: null when default_phone absent", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "ya-1", login: "yalogin", real_name: "Иван", default_email: "ivan@yandex.ru" }),
    } as Response);
    const info = await fetchYandexUserInfo("tok", mockFetch);
    expect(info.phone).toBeNull();
  });

  it("falls back to login when real_name absent", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "ya-2", login: "mylogin", default_email: null }),
    } as Response);
    const info = await fetchYandexUserInfo("tok", mockFetch);
    expect(info.name).toBe("mylogin");
    expect(info.email).toBeNull();
    expect(info.phone).toBeNull();
  });

  it("throws on non-ok HTTP response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response);
    await expect(fetchYandexUserInfo("bad-tok", mockFetch)).rejects.toThrow(
      "yandex_userinfo_failed"
    );
  });

  it("throws on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network_fail"));
    await expect(fetchYandexUserInfo("tok", mockFetch)).rejects.toThrow(
      "yandex_userinfo_network_error"
    );
  });
});
