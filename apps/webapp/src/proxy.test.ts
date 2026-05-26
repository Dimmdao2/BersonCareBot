import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "@/modules/auth/sessionCookieNames";
import { encodeSessionCookie, SESSION_SLIDING_TTL_SECONDS } from "@/modules/auth/sessionCookie";
import type { AppSession } from "@/shared/types/session";
import { MESSENGER_SURFACE_COOKIE_NAME, PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";

describe("proxy (Next convention)", () => {
  it("returns next without redirect for /app/patient without ctx", () => {
    const req = new NextRequest("http://localhost/app/patient/today?q=1");
    const res = proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("sets messenger cookies on /app/max entry without ctx", () => {
    const req = new NextRequest("http://localhost/app/max?t=abc");
    const res = proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${PLATFORM_COOKIE_NAME}=bot`);
    expect(setCookie).toContain(`${MESSENGER_SURFACE_COOKIE_NAME}=max`);
  });

  it("renews session cookie on /api/me when TTL is low", () => {
    const now = Math.floor(Date.now() / 1000);
    const session: AppSession = {
      user: { userId: "u1", role: "client", displayName: "T", bindings: {} },
      issuedAt: now - 60 * 60 * 25,
      expiresAt: now + SESSION_SLIDING_TTL_SECONDS / 4,
    };
    const req = new NextRequest("http://localhost/api/me", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeSessionCookie(session)}` },
    });
    const res = proxy(req);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
  });
});
