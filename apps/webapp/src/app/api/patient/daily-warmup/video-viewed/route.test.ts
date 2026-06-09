import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

const mockRecordDailyWarmupVideoView = vi.hoisted(() => vi.fn());
vi.mock("@/modules/patient-home/recordDailyWarmupVideoView", () => ({
  recordDailyWarmupVideoView: mockRecordDailyWarmupVideoView,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientHomeBlocks: {},
    contentPages: {},
    contentSections: {},
    systemSettings: {},
    patientDailyWarmupPresentation: {},
    patientDailyWarmupVideoViews: { recordView: vi.fn() },
    patientPractice: { getLatestDailyWarmupCompletedContentPageId: vi.fn() },
    patientCalendarTimezone: { getIanaForUser: vi.fn() },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { POST } from "./route";

const SESSION = {
  user: { userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "client" as const, phone: "+79990001122" },
};

const PAGE_ID = "11111111-1111-4111-8111-111111111111";

describe("POST /api/patient/daily-warmup/video-viewed", () => {
  beforeEach(() => {
    mockRequirePatientApiBusinessAccess.mockReset();
    mockRecordDailyWarmupVideoView.mockReset();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockRecordDailyWarmupVideoView.mockResolvedValue({ ok: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(
      new Request("http://localhost/api/patient/daily-warmup/video-viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentPageId: PAGE_ID }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("records video view for daily warmup page", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/daily-warmup/video-viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentPageId: PAGE_ID }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRecordDailyWarmupVideoView).toHaveBeenCalledWith(
      SESSION.user.userId,
      PAGE_ID,
      expect.objectContaining({
        patientPractice: expect.any(Object),
        patientCalendarTimezone: expect.any(Object),
      }),
    );
  });

  it("returns 403 when page is not in daily_warmup block", async () => {
    mockRecordDailyWarmupVideoView.mockResolvedValue({ ok: false, error: "not_daily_warmup" });
    const res = await POST(
      new Request("http://localhost/api/patient/daily-warmup/video-viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentPageId: PAGE_ID }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
