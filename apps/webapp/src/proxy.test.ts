import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "@/modules/auth/sessionCookieNames";
import { encodeSessionCookie, SESSION_SLIDING_TTL_SECONDS } from "@/modules/auth/sessionCookie";
import type { AppSession } from "@/shared/types/session";
import { MESSENGER_SURFACE_COOKIE_NAME, PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";
import { BC_CORRELATION_ID_HEADER } from "@bersoncare/db-principal";

describe("proxy (Next convention)", () => {
  it("returns next without redirect for /app/patient without ctx", () => {
    const req = new NextRequest("http://localhost/app/patient/today?q=1");
    const res = proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get(BC_CORRELATION_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("preserves a valid correlation UUID and replaces forged or oversized caller text", () => {
    const valid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const accepted = proxy(new NextRequest("http://localhost/api/me", {
      headers: { [BC_CORRELATION_ID_HEADER]: valid },
    }));
    expect(accepted.headers.get(BC_CORRELATION_ID_HEADER)).toBe(valid);

    for (const forged of ["patient-name-or-token", "x".repeat(10_000)]) {
      const replaced = proxy(new NextRequest("http://localhost/api/me", {
        headers: { [BC_CORRELATION_ID_HEADER]: forged },
      }));
      const actual = replaced.headers.get(BC_CORRELATION_ID_HEADER);
      expect(actual).toMatch(/^[0-9a-f-]{36}$/);
      expect(actual).not.toBe(forged);
    }
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
