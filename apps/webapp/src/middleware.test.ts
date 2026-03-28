import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { handlePlatformContextRequest } from "@/middleware/platformContext";
import { PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

describe("handlePlatformContextRequest", () => {
  it("returns next() when ctx is absent", () => {
    const req = new NextRequest("http://localhost/app/patient");
    const res = handlePlatformContextRequest(req);
    expect(res.status).toBe(200);
  });

  it("returns next() when ctx is not bot", () => {
    const req = new NextRequest("http://localhost/app/patient?ctx=other");
    const res = handlePlatformContextRequest(req);
    expect(res.status).toBe(200);
  });

  it("redirects without ctx=bot and sets platform cookie", () => {
    const req = new NextRequest("http://localhost/app/patient?ctx=bot&keep=1");
    const res = handlePlatformContextRequest(req, { isProduction: false });
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toBe("http://localhost/app/patient?keep=1");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${PLATFORM_COOKIE_NAME}=bot`);
    expect(setCookie.toLowerCase()).not.toContain("httponly");
  });

  it("uses SameSite=None and Secure in production", () => {
    const req = new NextRequest("https://example.com/app?ctx=bot");
    const res = handlePlatformContextRequest(req, { isProduction: true });
    const setCookie = (res.headers.get("set-cookie") ?? "").toLowerCase();
    expect(setCookie).toContain("samesite=none");
    expect(setCookie).toContain("secure");
  });
});
