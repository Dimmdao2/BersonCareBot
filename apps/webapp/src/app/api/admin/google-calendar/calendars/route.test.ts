import { describe, expect, it, vi, beforeEach } from "vitest";

const googleMocks = vi.hoisted(() => ({
  getGoogleClientId: vi.fn().mockResolvedValue("cid"),
  getGoogleClientSecret: vi.fn().mockResolvedValue("csec"),
  getGoogleRefreshToken: vi.fn().mockResolvedValue("rt"),
}));

vi.mock("@/modules/system-settings/integrationRuntime", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/modules/system-settings/integrationRuntime")>();
  return {
    ...m,
    getGoogleClientId: googleMocks.getGoogleClientId,
    getGoogleClientSecret: googleMocks.getGoogleClientSecret,
    getGoogleRefreshToken: googleMocks.getGoogleRefreshToken,
  };
});

const refreshMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/google-calendar/googleOAuthHelpers", () => ({
  refreshGoogleAccessToken: refreshMock,
  fetchGoogleCalendarList: listMock,
}));

const sessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: sessionMock,
}));

import { GET } from "./route";

describe("GET /api/admin/google-calendar/calendars", () => {
  beforeEach(() => {
    sessionMock.mockResolvedValue({ user: { role: "admin", userId: "u1" } });
    googleMocks.getGoogleClientId.mockResolvedValue("cid");
    googleMocks.getGoogleClientSecret.mockResolvedValue("csec");
    googleMocks.getGoogleRefreshToken.mockResolvedValue("rt");
    refreshMock.mockReset();
    listMock.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    sessionMock.mockResolvedValue({ user: { role: "doctor", userId: "u1" } });
    const res = await GET();
    expect(res.status).toBe(403);
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
