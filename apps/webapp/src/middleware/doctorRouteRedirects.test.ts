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

  it.each(["future", "past"])(
    "redirects legacy /app/doctor/appointments?view=%s to the canonical calendar",
    (view) => {
      const res = doctorRouteRedirectResponse(req(`/app/doctor/appointments?view=${view}`));
      expect(res?.status).toBe(308);
      expect(res?.headers.get("location")).toBe(
        "http://localhost/app/doctor/schedule?tab=cal",
      );
    },
  );

  it("redirects /app/doctor/system-health to /app/platform/system-health (PLAT-01…09 slice 1)", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/system-health"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/platform/system-health",
    );
  });

  it("redirects /app/doctor/health-archive to /app/platform/health-archive (PLAT-01…09 slice 2)", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/health-archive"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/platform/health-archive",
    );
  });

  it("redirects /app/doctor/audit-log to /app/platform/audit-log (PLAT-01…09 slice 2)", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/audit-log"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/platform/audit-log",
    );
  });

  it("redirects /app/doctor/commercial to /app/platform/commercial (PLAT-01…09 slice 3)", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/commercial"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/platform/commercial",
    );
  });

  it("does NOT redirect /app/doctor/admin/booking — it is a global-admin page, and middleware has no role", () => {
    // Regression guard. This path used to be in the legacy map, which runs before any session is
    // resolved, so the 308 applied to the global admin too. That made BookingOverviewPanel and
    // PlatformLocationPaletteSection — which exist nowhere else — unreachable for everyone, and hid
    // the fact that the page itself was broken. The role decision now lives in the page's guard
    // (requireAdminDoctorPage -> requirePlatformOperationsPage), which can actually see the session.
    const res = doctorRouteRedirectResponse(req("/app/doctor/admin/booking"));
    expect(res).toBeNull();
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
    expect(doctorRouteRedirectResponse(req("/app/doctor"))).toBeNull();
    expect(doctorRouteRedirectResponse(req("/app/patient"))).toBeNull();
  });
});

describe("doctorRouteRedirectResponse — /clients/ → new /patients/ card (old card retired)", () => {
  it("redirects /app/doctor/clients (list) to /patients", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/clients"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("http://localhost/app/doctor/patients");
  });

  it("redirects /clients/:userId to /patients/:userId", () => {
    const res = doctorRouteRedirectResponse(req("/app/doctor/clients/user-123"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("http://localhost/app/doctor/patients/user-123");
  });

  it("redirects /clients/:userId/treatment-programs/:instanceId to /patients/:userId/programs/:instanceId", () => {
    const res = doctorRouteRedirectResponse(
      req("/app/doctor/clients/user-123/treatment-programs/inst-9"),
    );
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/patients/user-123/programs/inst-9",
    );
  });

  it("preserves query (discussionItem) across the program redirect", () => {
    const res = doctorRouteRedirectResponse(
      req("/app/doctor/clients/u1/treatment-programs/i1?discussionItem=d1"),
    );
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/app/doctor/patients/u1/programs/i1?discussionItem=d1",
    );
  });

  it("does NOT redirect /clients/name-match-hints (admin tool, no /patients/ equivalent)", () => {
    expect(doctorRouteRedirectResponse(req("/app/doctor/clients/name-match-hints"))).toBeNull();
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
