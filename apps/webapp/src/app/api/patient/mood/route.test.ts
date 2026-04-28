import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

const mockUpsertToday = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientMood: { upsertToday: mockUpsertToday },
  }),
}));

const mockGetAppDisplayTimeZone = vi.hoisted(() => vi.fn().mockResolvedValue("Europe/Moscow"));
vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: mockGetAppDisplayTimeZone,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { POST } from "./route";

const SESSION = {
  user: { userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "client" as const, phone: "+79990001122" },
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/patient/mood", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/patient/mood", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockUpsertToday.mockResolvedValue({ moodDate: "2026-04-28", score: 4 });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(makeRequest({ score: 4 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid score", async () => {
    const res = await POST(makeRequest({ score: 6 }));
    expect(res.status).toBe(400);
    expect(mockUpsertToday).not.toHaveBeenCalled();
  });

  it("upserts today's mood using app display timezone", async () => {
    const res = await POST(makeRequest({ score: 4 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, mood: { moodDate: "2026-04-28", score: 4 } });
    expect(mockGetAppDisplayTimeZone).toHaveBeenCalled();
    expect(mockUpsertToday).toHaveBeenCalledWith(SESSION.user.userId, "Europe/Moscow", 4);
  });
});
