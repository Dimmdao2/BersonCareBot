import { describe, expect, it, vi, beforeEach } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn());
const startChannelLinkMock = vi.hoisted(() => vi.fn());
const getTelegramLoginBotUsernameMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/system-settings/telegramLoginBotUsername", () => ({
  getTelegramLoginBotUsername: () => getTelegramLoginBotUsernameMock(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

vi.mock("@/modules/auth/channelLinkStartRateLimit", () => ({
  isChannelLinkStartRateLimited: (...args: unknown[]) => rateLimitMock(...args),
}));

vi.mock("@/modules/auth/channelLink", () => ({
  startChannelLink: (...args: unknown[]) => startChannelLinkMock(...args),
}));

import { POST } from "./route";

describe("POST /api/auth/channel-link/start", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    rateLimitMock.mockReset();
    startChannelLinkMock.mockReset();
    getTelegramLoginBotUsernameMock.mockReset();
    getTelegramLoginBotUsernameMock.mockResolvedValue("test_bot");
    rateLimitMock.mockResolvedValue(false);
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "user-1", role: "client", bindings: {} },
    });
    startChannelLinkMock.mockResolvedValue({
      ok: true as const,
      url: "https://t.me/test_bot?start=link_x",
      expiresAtIso: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns 401 without session", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/auth/channel-link/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channelCode: "telegram" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(startChannelLinkMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockResolvedValue(true);
    const res = await POST(
      new Request("http://localhost/api/auth/channel-link/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channelCode: "telegram" }),
      }),
    );
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("rate_limited");
    expect(startChannelLinkMock).not.toHaveBeenCalled();
    expect(rateLimitMock).toHaveBeenCalledWith("user-1");
  });

  it("returns 200 with url when ok", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/channel-link/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channelCode: "telegram" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok?: boolean; url?: string };
    expect(data.ok).toBe(true);
    expect(data.url).toContain("t.me");
    expect(startChannelLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", channelCode: "telegram", botUsername: "test_bot" }),
    );
  });
});
