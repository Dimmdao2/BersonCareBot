import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { doctorRouteRedirectResponse } from "@/middleware/doctorRouteRedirects";

function req(path: string, headers?: Record<string, string>) {
  return new NextRequest(new URL(path, "http://localhost"), headers ? { headers } : undefined);
}

describe("doctorRouteRedirectResponse — 308 redirects (old → new URLs)", () => {
  // ── Schedule legacy → /schedule?tab=cal|setup ─────────────────────────────

  it("redirects /app/doctor/calendar to schedule?tab=cal", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/calendar"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/schedule?tab=cal",
    );
  });

  it("redirects /app/doctor/appointments to schedule?tab=cal", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/appointments"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/schedule?tab=cal",
    );
  });

  it("redirects /app/doctor/admin/booking to schedule?tab=setup", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/admin/booking"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/schedule?tab=setup",
    );
  });

  // ── Communications legacy ─────────────────────────────────────────────────

  it("redirects /app/doctor/messages to communications?tab=chats", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/messages"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/communications?tab=chats",
    );
  });

  it("redirects /app/doctor/online-intake to communications?tab=intake", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/online-intake"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/communications?tab=intake",
    );
  });

  it("redirects /app/doctor/comments to communications?tab=comments", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/comments"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/communications?tab=comments",
    );
  });

  it("redirects online-intake detail to communications?tab=intake&id=...", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/online-intake/abc-123"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/communications?tab=intake&id=abc-123",
    );
  });

  it("redirects /app/doctor/broadcasts to communications?tab=broadcasts", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/broadcasts"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/communications?tab=broadcasts",
    );
  });

  it("redirects /app/doctor/broadcasts/archive before /broadcasts (order matters)", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/broadcasts/archive"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/communications?tab=broadcasts&archive=1",
    );
  });

  it("returns null for paths that need no redirect", () => {
    expect(doctorRouteRedirectResponse(req("/app/doctor/clients"))).toBeNull();
    expect(doctorRouteRedirectResponse(req("/app/doctor"))).toBeNull();
    expect(doctorRouteRedirectResponse(req("/app/patient"))).toBeNull();
  });
});

describe("doctorRouteRedirectResponse — /app/doctor/schedule passes through (real page)", () => {
  // /app/doctor/schedule — настоящая страница-шелл (e12); rewrite убран.
  // 308-редиректы со старых URL сохранены выше; сам /schedule проходит насквозь.

  it("passes through /app/doctor/schedule (no tab) — null, not rewrite", () => {
    expect(doctorRouteRedirectResponse(req("/app/doctor/schedule"))).toBeNull();
  });

  it("passes through /app/doctor/schedule?tab=cal — null", () => {
    expect(doctorRouteRedirectResponse(req("/app/doctor/schedule?tab=cal"))).toBeNull();
  });

  it("passes through /app/doctor/schedule?tab=work — null", () => {
    expect(doctorRouteRedirectResponse(req("/app/doctor/schedule?tab=work"))).toBeNull();
  });

  it("passes through /app/doctor/schedule?tab=setup — null", () => {
    expect(doctorRouteRedirectResponse(req("/app/doctor/schedule?tab=setup"))).toBeNull();
  });
});

describe("doctorRouteRedirectResponse — communications passes through (no rewrite)", () => {
  // /app/doctor/communications — настоящая страница-шелл; rewrite убран в Block 5.
  // 308-редиректы со старых URL сохранены выше; сам /communications проходит насквозь.

  it("passes through /app/doctor/communications (no tab) — null, not rewrite", () => {
    expect(doctorRouteRedirectResponse(req("/app/doctor/communications"))).toBeNull();
  });

  it("passes through /app/doctor/communications?tab=chats — null", () => {
    expect(doctorRouteRedirectResponse(req("/app/doctor/communications?tab=chats"))).toBeNull();
  });

  it("passes through communications?tab=intake — null", () => {
    expect(
      doctorRouteRedirectResponse(req("/app/doctor/communications?tab=intake")),
    ).toBeNull();
  });

  it("passes through communications?tab=intake&id=xyz — null", () => {
    expect(
      doctorRouteRedirectResponse(req("/app/doctor/communications?tab=intake&id=xyz-456")),
    ).toBeNull();
  });

  it("passes through communications?tab=comments — null", () => {
    expect(
      doctorRouteRedirectResponse(req("/app/doctor/communications?tab=comments")),
    ).toBeNull();
  });

  it("passes through communications?tab=broadcasts — null", () => {
    expect(
      doctorRouteRedirectResponse(req("/app/doctor/communications?tab=broadcasts")),
    ).toBeNull();
  });

  it("passes through communications?tab=broadcasts&archive=1 — null", () => {
    expect(
      doctorRouteRedirectResponse(req("/app/doctor/communications?tab=broadcasts&archive=1")),
    ).toBeNull();
  });
});

describe("doctorRouteRedirectResponse — re-entry guard (loop prevention)", () => {
  // Маркер прокидывается proxy.ts при внутреннем rewrite.
  // На повторном входе вся логика пропускается — петли нет.
  it("returns null for /app/doctor/calendar when marker present", () => {
    const res = doctorRouteRedirectResponse(
      req("/app/doctor/calendar", { "x-bc-doctor-rewrite": "1" }),
    );
    expect(res).toBeNull();
  });

  it("returns null for /app/doctor/messages when marker present", () => {
    const res = doctorRouteRedirectResponse(
      req("/app/doctor/messages", { "x-bc-doctor-rewrite": "1" }),
    );
    expect(res).toBeNull();
  });

  it("returns null for /app/doctor/online-intake/abc when marker present", () => {
    const res = doctorRouteRedirectResponse(
      req("/app/doctor/online-intake/abc-123", { "x-bc-doctor-rewrite": "1" }),
    );
    expect(res).toBeNull();
  });

  it("still redirects legacy URL when marker is absent (direct hit)", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/calendar"));
    expect(res?.status).toBe(308);
  });
});
