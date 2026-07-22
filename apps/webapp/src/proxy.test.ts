import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "@/modules/auth/sessionCookieNames";
import { encodeSessionCookie, SESSION_SLIDING_TTL_SECONDS } from "@/modules/auth/sessionCookie";
import type { AppSession } from "@/shared/types/session";
import { MESSENGER_SURFACE_COOKIE_NAME, PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";
import { BC_CORRELATION_ID_HEADER } from "@bersoncare/db-principal";
import {
  APPLE_FORM_POST_CSRF_EXEMPT_PATH,
  INTERNAL_BEARER_CSRF_EXEMPT_PATHS,
  INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS,
} from "@/middleware/csrfOrigin";

function mutationRequest(pathname: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://bersoncare.ru${pathname}`, {
    method: "POST",
    headers: {
      Host: "bersoncare.ru",
      "X-Forwarded-Proto": "https",
      ...headers,
    },
  });
}

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

  it("allows browser API mutations with exact Origin or Referer", () => {
    const now = Math.floor(Date.now() / 1000);
    const authenticatedSession: AppSession = {
      user: { userId: "u1", role: "client", displayName: "T", bindings: {} },
      issuedAt: now,
      expiresAt: now + SESSION_SLIDING_TTL_SECONDS,
    };
    const originResponse = proxy(mutationRequest("/api/auth/exchange", {
      Cookie: `${SESSION_COOKIE_NAME}=${encodeSessionCookie(authenticatedSession)}`,
      Origin: "https://bersoncare.ru",
      "Sec-Fetch-Site": "same-origin",
    }));
    expect(originResponse.status).toBe(200);

    const refererResponse = proxy(mutationRequest("/api/booking/public/create", {
      Referer: "https://bersoncare.ru/book/appointment?step=2",
    }));
    expect(refererResponse.status).toBe(200);
  });

  it("allows same-origin Server Actions and rejects cross-site or headerless actions before dispatch", async () => {
    const sameOrigin = proxy(mutationRequest("/app/doctor/content", {
      Origin: "https://bersoncare.ru",
      "Sec-Fetch-Site": "same-origin",
      "Next-Action": "bounded-action-id",
    }));
    expect(sameOrigin.status).toBe(200);

    const rejectedHeaderSets: Array<Record<string, string>> = [
      { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site", "Next-Action": "bounded-action-id" },
      { "Next-Action": "bounded-action-id" },
    ];
    for (const headers of rejectedHeaderSets) {
      const rejected = proxy(mutationRequest("/app/doctor/content", headers));
      expect(rejected.status).toBe(403);
      expect(await rejected.json()).toEqual({ ok: false, error: "csrf_origin_forbidden" });
    }
  });

  it("rejects before redirects, platform cookies, or session renewal and returns a bounded response", async () => {
    const now = Math.floor(Date.now() / 1000);
    const session: AppSession = {
      user: { userId: "u1", role: "client", displayName: "T", bindings: {} },
      issuedAt: now - 60 * 60 * 25,
      expiresAt: now + SESSION_SLIDING_TTL_SECONDS / 4,
    };
    const correlationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const response = proxy(mutationRequest("/app?ctx=max", {
      Cookie: `${SESSION_COOKIE_NAME}=${encodeSessionCookie(session)}`,
      Origin: "https://evil.example/private-origin",
      "Sec-Fetch-Site": "cross-site",
      [BC_CORRELATION_ID_HEADER]: correlationId,
    }));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('{"ok":false,"error":"csrf_origin_forbidden"}');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get(BC_CORRELATION_ID_HEADER)).toBe(correlationId);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect([...response.headers.values()].join("\n")).not.toContain("evil.example");
  });

  it("allows every stronger-auth exemption without browser headers", () => {
    for (const pathname of [
      ...INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS,
      ...INTERNAL_BEARER_CSRF_EXEMPT_PATHS,
      "/api/payments/webhook/yookassa",
      "/api/payments/patient-acquiring-webhook/tinkoff",
      APPLE_FORM_POST_CSRF_EXEMPT_PATH,
    ]) {
      const response = proxy(mutationRequest(pathname));
      expect(response.status, pathname).toBe(200);
    }
  });

  it("does not exempt lookalike, public, or auth paths", () => {
    for (const pathname of [
      "/api/integrator/events/",
      "/api/internal/media-preview/process/extra",
      "/api/payments/webhook/yookassa/extra",
      "/api/auth/oauth/callback/apple/extra",
      "/api/auth/exchange",
      "/api/booking/public/create",
      "/api/booking/payments/mock-complete",
      "/api/booking/memberships/payments/mock-complete",
      "/api/booking/products/payments/mock-complete",
      "/api/booking/public/payments/mock-complete",
      "/api/booking/public/products/payments/mock-complete",
    ]) {
      const response = proxy(mutationRequest(pathname));
      expect(response.status, pathname).toBe(403);
      expect(response.headers.get("set-cookie"), pathname).toBeNull();
    }
  });

  it("uses exact Host, ignores X-Forwarded-Host, and validates the first forwarded proto", () => {
    const ignoredForwardedHost = proxy(mutationRequest("/api/auth/exchange", {
      Origin: "https://bersoncare.ru",
      "X-Forwarded-Host": "evil.example",
      "X-Forwarded-Proto": "https, http",
    }));
    expect(ignoredForwardedHost.status).toBe(200);

    const exactLoopbackHost = proxy(new NextRequest("http://127.0.0.1:5200/api/auth/exchange", {
      method: "POST",
      headers: {
        Host: "127.0.0.1:5200",
        "X-Forwarded-Host": "localhost:5200",
        Origin: "http://localhost:5200",
      },
    }));
    expect(exactLoopbackHost.status).toBe(403);

    const invalidProto = proxy(mutationRequest("/api/auth/exchange", {
      Origin: "https://bersoncare.ru",
      "X-Forwarded-Proto": "ftp, https",
    }));
    expect(invalidProto.status).toBe(403);
  });
});
