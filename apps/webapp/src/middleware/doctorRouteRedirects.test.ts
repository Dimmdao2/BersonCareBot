import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { doctorRouteRedirectResponse } from "@/middleware/doctorRouteRedirects";

function req(path: string, headers?: Record<string, string>) {
  return new NextRequest(new URL(path, "http://localhost"), headers ? { headers } : undefined);
}

describe("doctorRouteRedirectResponse — 308 redirects (old → new URLs)", () => {
  it("redirects /app/doctor/calendar to schedule?tab=calendar", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/calendar"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/schedule?tab=calendar",
    );
  });

  it("does not redirect /app/doctor/appointments (list stays direct until schedule shell)", () => {
    expect(doctorRouteRedirectResponse(req("/app/doctor/appointments"))).toBeNull();
  });

  it("redirects /app/doctor/admin/booking to schedule?tab=setup", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/admin/booking"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/schedule?tab=setup",
    );
  });

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

describe("doctorRouteRedirectResponse — internal rewrites (schedule only)", () => {
  const isRewrite = (res: ReturnType<typeof doctorRouteRedirectResponse>) =>
    res !== null && res.status !== 308 && res.headers.has("x-middleware-rewrite");

  it("rewrites /app/doctor/schedule (no tab) to /app/doctor/calendar", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/schedule"));
    expect(isRewrite(res)).toBe(true);
    expect(res!.headers.get("x-middleware-rewrite")).toContain("/app/doctor/calendar");
  });

  it("rewrites /app/doctor/schedule?tab=calendar to /app/doctor/calendar", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/schedule?tab=calendar"));
    expect(isRewrite(res)).toBe(true);
    expect(res!.headers.get("x-middleware-rewrite")).toContain("/app/doctor/calendar");
  });

  it("rewrites /app/doctor/schedule?tab=setup to /app/doctor/admin/booking", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/schedule?tab=setup"));
    expect(isRewrite(res)).toBe(true);
    expect(res!.headers.get("x-middleware-rewrite")).toContain("/app/doctor/admin/booking");
  });

  it("rewrites /app/doctor/schedule?tab=appointments to /app/doctor/appointments", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/schedule?tab=appointments"));
    expect(isRewrite(res)).toBe(true);
    expect(res!.headers.get("x-middleware-rewrite")).toContain("/app/doctor/appointments");
  });

  it("rewrites rewritten URL does NOT have search params (no tab= leaks to legacy page)", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/schedule?tab=calendar"));
    const rewriteTarget = res!.headers.get("x-middleware-rewrite") ?? "";
    expect(rewriteTarget).not.toContain("tab=");
  });

  it("rewrite carries re-entry marker header on the rewritten request", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/schedule?tab=calendar"));
    // Маркер прокидывается в заголовки переписанного запроса (request override).
    expect(res!.headers.get("x-middleware-override-headers")).toContain("x-bc-doctor-rewrite");
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
  // В Next 16 (proxy) внутренний rewrite повторно проходит через proxy.
  // На повторном входе запрос несёт маркер → вся логика пропускается, петли нет.
  it("returns null for rewrite target /app/doctor/calendar when marker present", () => {
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
