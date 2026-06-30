import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const relayOutboundMock = vi.hoisted(() => vi.fn());
const envForTest = vi.hoisted(() => ({ ADMIN_TELEGRAM_ID: 424242 as number | undefined }));
const headerMap = vi.hoisted(() => ({
  entries: [["user-agent", "VitestUA/1"]] as [string, string][],
}));
let supportTestIpSeq = 0;

// S7: relay-outbound is now the send path instead of raw Telegram fetch
vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayOutboundMock,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(headerMap.entries)),
}));

vi.mock("@/config/env", () => ({
  env: envForTest,
}));

import { POST } from "./route";

const jsonBody = (email: string, message: string) =>
  JSON.stringify({ email, message, surface: "browser", from: "/app/contact-support" });

describe("POST /api/public/support", () => {
  beforeEach(() => {
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });
    envForTest.ADMIN_TELEGRAM_ID = 424242;
    supportTestIpSeq += 1;
    headerMap.entries = [
      ["user-agent", "VitestUA/1"],
      ["x-forwarded-for", `203.0.113.${supportTestIpSeq % 250}`],
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(
      new Request("http://localhost/api/public/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("not-an-email", "hello"),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 and calls relayOutbound with correct params", async () => {
    const res = await POST(
      new Request("http://localhost/api/public/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("guest@example.com", "Need help"),
      }),
    );
    expect(res.status).toBe(200);
    expect(relayOutboundMock).toHaveBeenCalledTimes(1);
    const [params] = relayOutboundMock.mock.calls[0] as [{ channel: string; recipient: string; text: string; messageId: string }];
    expect(params.channel).toBe("telegram");
    expect(params.recipient).toBe("424242");
    expect(params.text).toContain("гость");
    expect(params.text).toContain("guest@example.com");
  });

  it("returns 429 when rate limited for same IP", async () => {
    headerMap.entries = [
      ["user-agent", "VitestUA/1"],
      ["x-forwarded-for", "198.18.0.77"],
    ];
    const first = await POST(
      new Request("http://localhost/api/public/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("a@b.co", "one"),
      }),
    );
    expect(first.status).toBe(200);
    const second = await POST(
      new Request("http://localhost/api/public/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("a@b.co", "two"),
      }),
    );
    expect(second.status).toBe(429);
  });

  it("returns 503 when ADMIN_TELEGRAM_ID is missing", async () => {
    envForTest.ADMIN_TELEGRAM_ID = undefined;
    const res = await POST(
      new Request("http://localhost/api/public/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("guest@example.com", "help"),
      }),
    );
    expect(res.status).toBe(503);
  });

  it("returns 503 when ADMIN_TELEGRAM_ID is 0", async () => {
    envForTest.ADMIN_TELEGRAM_ID = 0;
    const res = await POST(
      new Request("http://localhost/api/public/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("guest@example.com", "help"),
      }),
    );
    expect(res.status).toBe(503);
  });

  describe("relay-outbound chokepoint (S7 / P25)", () => {
    it("calls relayOutbound with channel=telegram and recipient=ADMIN_TELEGRAM_ID", async () => {
      const res = await POST(
        new Request("http://localhost/api/public/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("guest@example.com", "help please"),
        }),
      );
      expect(res.status).toBe(200);
      expect(relayOutboundMock).toHaveBeenCalledTimes(1);
      const [params] = relayOutboundMock.mock.calls[0] as [{ channel: string; recipient: string; messageId: string }];
      expect(params.channel).toBe("telegram");
      expect(params.recipient).toBe("424242");
      expect(params.messageId).toMatch(/^support:public:/);
    });

    it("returns 502 when relayOutbound fails", async () => {
      relayOutboundMock.mockResolvedValue({ ok: false, reason: "no_integrator_url" });
      const res = await POST(
        new Request("http://localhost/api/public/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("guest@example.com", "help please"),
        }),
      );
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("send_failed");
    });

    it("does not stamp rate-limit on failed relay (allows retry)", async () => {
      headerMap.entries = [
        ["user-agent", "VitestUA/1"],
        ["x-forwarded-for", "198.18.1.99"],
      ];
      relayOutboundMock.mockResolvedValueOnce({ ok: false, reason: "relay_error" });
      const first = await POST(
        new Request("http://localhost/api/public/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("a@b.co", "one"),
        }),
      );
      expect(first.status).toBe(502);
      // second request on same IP should not be rate-limited
      const second = await POST(
        new Request("http://localhost/api/public/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("a@b.co", "two"),
        }),
      );
      expect(second.status).toBe(200);
    });
  });
});
