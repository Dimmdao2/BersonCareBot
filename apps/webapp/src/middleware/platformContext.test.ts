import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { handlePlatformContextRequest } from "@/middleware/platformContext";
import { MESSENGER_SURFACE_COOKIE_NAME } from "@/shared/lib/platform";

describe("handlePlatformContextRequest", () => {
  it("sets messenger surface cookie telegram for ctx=bot", () => {
    const req = new NextRequest("https://example.com/app?ctx=bot");
    const res = handlePlatformContextRequest(req);
    expect(res.headers.get("location")).toContain("/app");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${MESSENGER_SURFACE_COOKIE_NAME}=telegram`);
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
