import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const relaySupportSubmissionMock = vi.hoisted(() => vi.fn());
const stampBootstrapPrincipalMock = vi.hoisted(() => vi.fn());
const headerMap = vi.hoisted(() => ({
  entries: [["user-agent", "VitestUA/1"]] as [string, string][],
}));
let supportTestIpSeq = 0;

// D-2: Telegram-only relayOutbound replaced by the multi-channel operator-alert relay.
vi.mock("@/app-layer/support/relaySupportSubmission", () => ({
  relaySupportSubmission: relaySupportSubmissionMock,
}));

vi.mock("@/app-layer/principal/bootstrapPrincipal", () => ({
  stampBootstrapPrincipal: stampBootstrapPrincipalMock,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(headerMap.entries)),
}));

import { POST } from "./route";

const jsonBody = (email: string, message: string) =>
  JSON.stringify({ email, message, surface: "browser", from: "/app/contact-support" });

describe("POST /api/public/support", () => {
  beforeEach(() => {
    relaySupportSubmissionMock.mockResolvedValue({ delivered: true, persisted: false });
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

  it("returns 200 and relays with correct guest content", async () => {
    const res = await POST(
      new Request("http://localhost/api/public/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody("guest@example.com", "Need help"),
      }),
    );
    expect(res.status).toBe(200);
    expect(relaySupportSubmissionMock).toHaveBeenCalledTimes(1);
    const [params] = relaySupportSubmissionMock.mock.calls[0] as [
      { kind: string; email: string; message: string; lines: string[] },
    ];
    expect(params.kind).toBe("guest");
    expect(params.email).toBe("guest@example.com");
    expect(params.message).toBe("Need help");
    expect(params.lines.join("\n")).toContain("гость");
    expect(params.lines.join("\n")).toContain("guest@example.com");
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

  describe("D-2: never a hard failure to the caller", () => {
    it("returns 200 ok:true with a non-alarming message when no channel confirms delivery", async () => {
      relaySupportSubmissionMock.mockResolvedValueOnce({ delivered: false, persisted: true });
      const res = await POST(
        new Request("http://localhost/api/public/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("guest@example.com", "help"),
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; delivered: boolean; message: string };
      expect(body.ok).toBe(true);
      expect(body.delivered).toBe(false);
      expect(body.message).not.toMatch(/недоступна|ошибка|попробуйте позже/i);
    });
  });

  describe("relay chokepoint (D-2)", () => {
    it("calls relaySupportSubmission with kind=guest and a unique messageId", async () => {
      const res = await POST(
        new Request("http://localhost/api/public/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("guest@example.com", "help please"),
        }),
      );
      expect(res.status).toBe(200);
      expect(relaySupportSubmissionMock).toHaveBeenCalledTimes(1);
      const [params] = relaySupportSubmissionMock.mock.calls[0] as [{ kind: string; messageId: string }];
      expect(params.kind).toBe("guest");
      expect(params.messageId).toMatch(/^support:public:/);
    });

    it("returns 200 (not an HTTP error) even when relaySupportSubmission reports total failure", async () => {
      relaySupportSubmissionMock.mockResolvedValueOnce({ delivered: false, persisted: false });
      const res = await POST(
        new Request("http://localhost/api/public/support", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: jsonBody("guest@example.com", "help please"),
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; delivered: boolean };
      expect(body.ok).toBe(true);
      expect(body.delivered).toBe(false);
    });

    it("stamps rate-limit even when relay reports total failure (submission was still accepted)", async () => {
      headerMap.entries = [
        ["user-agent", "VitestUA/1"],
        ["x-forwarded-for", "198.18.1.99"],
      ];
      relaySupportSubmissionMock.mockResolvedValueOnce({ delivered: false, persisted: true });
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
});
