import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const getTelegramBotTokenMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
const envForTest = vi.hoisted(() => ({ ADMIN_TELEGRAM_ID: 424242 as number | undefined }));
const headerMap = vi.hoisted(() => ({
  entries: [["user-agent", "VitestUA/1"]] as [string, string][],
}));
let supportTestIpSeq = 0;

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getTelegramBotToken: getTelegramBotTokenMock,
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
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true, text: async () => "{}" });
    getTelegramBotTokenMock.mockResolvedValue("token");
    envForTest.ADMIN_TELEGRAM_ID = 424242;
    supportTestIpSeq += 1;
    headerMap.entries = [
      ["user-agent", "VitestUA/1"],
      ["x-forwarded-for", `203.0.113.${supportTestIpSeq % 250}`],
    ];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("returns 200 and calls Telegram when ok", async () => {
    const res = await POST(
      new Request("http://localhost/api/public/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("guest@example.com", "Need help"),
      }),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(String(init.body)) as { text?: string };
    expect(parsed.text).toContain("гость");
    expect(parsed.text).toContain("guest@example.com");
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
});
