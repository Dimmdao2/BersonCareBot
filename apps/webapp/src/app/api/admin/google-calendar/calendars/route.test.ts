import { describe, expect, it, vi, beforeEach } from "vitest";

const googleMocks = vi.hoisted(() => ({
  getGoogleClientId: vi.fn().mockResolvedValue("cid"),
  getGoogleClientSecret: vi.fn().mockResolvedValue("csec"),
  getGoogleRefreshToken: vi.fn().mockResolvedValue("rt"),
  isGoogleCalendarPlatformAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/modules/system-settings/integrationRuntime", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/modules/system-settings/integrationRuntime")>();
  return {
    ...m,
    getGoogleClientId: googleMocks.getGoogleClientId,
    getGoogleClientSecret: googleMocks.getGoogleClientSecret,
    getGoogleRefreshToken: googleMocks.getGoogleRefreshToken,
    isGoogleCalendarPlatformAvailable: googleMocks.isGoogleCalendarPlatformAvailable,
  };
});

const refreshMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/google-calendar/googleOAuthHelpers", () => ({
  refreshGoogleAccessToken: refreshMock,
  fetchGoogleCalendarList: listMock,
}));

const clinicGateMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireClinicManagementApiContext: clinicGateMock,
}));

import { GET } from "./route";

describe("GET /api/admin/google-calendar/calendars", () => {
  beforeEach(() => {
    clinicGateMock.mockReset().mockResolvedValue({
      ok: true,
      ctx: { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", session: { user: { role: "doctor", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } } },
    });
    googleMocks.getGoogleClientId.mockResolvedValue("cid");
    googleMocks.getGoogleClientSecret.mockResolvedValue("csec");
    googleMocks.getGoogleRefreshToken.mockResolvedValue("rt");
    googleMocks.isGoogleCalendarPlatformAvailable.mockResolvedValue(true);
    refreshMock.mockReset();
    listMock.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    clinicGateMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when the platform guard rejects a foreign audience", async () => {
    clinicGateMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(googleMocks.getGoogleRefreshToken).not.toHaveBeenCalled();
  });

  it("returns 412 when not connected (no refresh token)", async () => {
    googleMocks.getGoogleRefreshToken.mockResolvedValue("");
    const res = await GET();
    expect(res.status).toBe(412);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("not_connected");
  });

  it("returns 502 when token refresh fails", async () => {
    refreshMock.mockRejectedValue(new Error("expired"));
    const res = await GET();
    expect(res.status).toBe(502);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("token_expired");
  });

  it("returns calendars on success", async () => {
    refreshMock.mockResolvedValue("new-at");
    listMock.mockResolvedValue([
      { id: "cal1", summary: "Main", primary: true },
      { id: "cal2", summary: "Work", primary: false },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; calendars: unknown[] };
    expect(data.ok).toBe(true);
    expect(data.calendars).toHaveLength(2);
  });

  it("returns 502 when calendar list fails", async () => {
    refreshMock.mockResolvedValue("at");
    listMock.mockRejectedValue(new Error("api error"));
    const res = await GET();
    expect(res.status).toBe(502);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("calendar_list_failed");
  });
});
