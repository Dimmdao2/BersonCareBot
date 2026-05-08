import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

const mockSubmitScore = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientMood: { submitScore: mockSubmitScore },
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
    mockSubmitScore.mockResolvedValue({
      ok: true,
      mood: { moodDate: "2026-04-28", score: 4 },
      lastEntry: { id: "e1", recordedAt: "2026-04-28T10:00:00.000Z", score: 4 },
    });
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
    expect(mockSubmitScore).not.toHaveBeenCalled();
  });

  it("submits mood with default intent auto", async () => {
    const res = await POST(makeRequest({ score: 4 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      mood: { moodDate: "2026-04-28", score: 4 },
      lastEntry: { id: "e1", recordedAt: "2026-04-28T10:00:00.000Z", score: 4 },
    });
    expect(mockGetAppDisplayTimeZone).toHaveBeenCalled();
    expect(mockSubmitScore).toHaveBeenCalledWith(SESSION.user.userId, "Europe/Moscow", 4, "auto");
  });

  it("returns 409 when intent_required", async () => {
    mockSubmitScore.mockResolvedValue({
      ok: false,
      error: "intent_required",
      lastEntry: { id: "e0", recordedAt: "2026-04-28T10:00:00.000Z", score: 3 },
    });
    const res = await POST(makeRequest({ score: 4, intent: "auto" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      ok: false,
      error: "intent_required",
      lastEntry: { id: "e0", recordedAt: "2026-04-28T10:00:00.000Z", score: 3 },
    });
  });
});
