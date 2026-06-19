import { describe, expect, it, vi, afterEach } from "vitest";
import { apiJson } from "./apiJson";

function mockFetch(status: number, body: string, ok?: boolean): void {
  const isOk = ok ?? (status >= 200 && status < 300);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: isOk,
      status,
      text: () => Promise.resolve(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiJson", () => {
  it("happy path: 200 with ok:true returns body", async () => {
    mockFetch(200, JSON.stringify({ ok: true, data: "x" }));
    const result = await apiJson<{ ok: true; data: string }>("/test");
    expect(result).toEqual({ ok: true, data: "x" });
  });

  it("HTTP error 400 with ok:false + error field throws with that message", async () => {
    mockFetch(400, JSON.stringify({ ok: false, error: "bad_request" }));
    await expect(apiJson("/test")).rejects.toThrow("bad_request");
  });

  it("body.ok === false with message field throws with message, not error", async () => {
    mockFetch(400, JSON.stringify({ ok: false, message: "validation failed", error: "e" }));
    await expect(apiJson("/test")).rejects.toThrow("validation failed");
  });

  it("200 OK with non-JSON body throws invalid_json", async () => {
    mockFetch(200, "<!DOCTYPE html>");
    await expect(apiJson("/test")).rejects.toThrow("invalid_json");
  });

  it("502 with HTML gateway error throws http_502", async () => {
    mockFetch(502, "<html>Bad Gateway</html>");
    await expect(apiJson("/test")).rejects.toThrow("http_502");
  });

  it("HTTP 500 with no body.error falls back to http_500", async () => {
    mockFetch(500, JSON.stringify({ ok: false }));
    await expect(apiJson("/test")).rejects.toThrow("http_500");
  });
});
