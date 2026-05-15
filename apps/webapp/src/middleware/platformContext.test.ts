import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  classifyEntryHintFromRequest,
  handlePlatformContextRequest,
  normalizeWebappEntryPathname,
} from "@/middleware/platformContext";
import { MESSENGER_SURFACE_COOKIE_NAME, PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

describe("handlePlatformContextRequest", () => {
  it("sets messenger surface cookie telegram for ctx=bot", () => {
    const req = new NextRequest("https://example.com/app?ctx=bot");
    const res = handlePlatformContextRequest(req);
    expect(res.headers.get("location")).toContain("/app");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${MESSENGER_SURFACE_COOKIE_NAME}=telegram`);
  });

  it("ctx=bot on /app strips ctx and keeps other query params", () => {
    const req = new NextRequest("https://example.com/app?ctx=bot&t=abc&next=%2Ffoo");
    const res = handlePlatformContextRequest(req);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/app");
    expect(loc).toContain("t=abc");
    expect(loc).toContain("next=");
    expect(loc).not.toContain("ctx=");
  });

  it("sets messenger surface cookie max for ctx=max", () => {
    const req = new NextRequest("https://example.com/app?ctx=max");
    const res = handlePlatformContextRequest(req);
    expect(res.headers.get("location")).toMatch(/\/app\/max(\?|$)/);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${MESSENGER_SURFACE_COOKIE_NAME}=max`);
  });

  it("ctx=max on /app preserves other query params on redirect to /app/max", () => {
    const req = new NextRequest("https://example.com/app?ctx=max&t=abc&next=%2Ffoo");
    const res = handlePlatformContextRequest(req);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/app/max");
    expect(loc).toContain("t=abc");
    expect(loc).toContain("next=");
    expect(loc).not.toContain("ctx=");
  });

  it("ctx=max on nested path does not rewrite pathname to /app/max", () => {
    const req = new NextRequest("https://example.com/app/patient?ctx=max");
    const res = handlePlatformContextRequest(req);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/app/patient");
    expect(loc).not.toContain("/app/max");
  });

  it("passes through without ctx", () => {
    const req = new NextRequest("https://example.com/app");
    const res = handlePlatformContextRequest(req);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("normalizeWebappEntryPathname", () => {
  it("trims trailing slashes", () => {
    expect(normalizeWebappEntryPathname("/app/max/")).toBe("/app/max");
    expect(normalizeWebappEntryPathname("/")).toBe("/");
  });
});

describe("classifyEntryHintFromRequest", () => {
  it("returns max_miniapp for /app/max regardless of query token", () => {
    const req = new NextRequest("https://example.com/app/max?t=jwt&next=%2Fapp%2Fpatient");
    expect(classifyEntryHintFromRequest(req)).toBe("max_miniapp");
  });

  it("returns telegram_miniapp for /app/tg with token", () => {
    const req = new NextRequest("https://example.com/app/tg?t=jwt");
    expect(classifyEntryHintFromRequest(req)).toBe("telegram_miniapp");
  });

  it("path wins over token for /app/max (no false token_exchange)", () => {
    const req = new NextRequest("https://example.com/app/max?t=abc");
    expect(classifyEntryHintFromRequest(req)).toBe("max_miniapp");
  });

  it("token_exchange on /app with t= and no platform cookie", () => {
    const req = new NextRequest("https://example.com/app?t=abc");
    expect(classifyEntryHintFromRequest(req)).toBe("token_exchange");
  });

  it("platform cookie still wins on /app with t=", () => {
    const req = new NextRequest("https://example.com/app?t=abc", {
      headers: {
        cookie: `${PLATFORM_COOKIE_NAME}=bot; ${MESSENGER_SURFACE_COOKIE_NAME}=max`,
      },
    });
    expect(classifyEntryHintFromRequest(req)).toBe("max_miniapp");
  });
});
