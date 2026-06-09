import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequirePatientApiBusinessAccess = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: mockRequirePatientApiBusinessAccess,
}));

const mockRecord = vi.hoisted(() => vi.fn());
const mockAdvanceDailyWarmup = vi.hoisted(() => vi.fn());
vi.mock("@/modules/patient-home/advanceDailyWarmupPresentationManually", () => ({
  advanceDailyWarmupPresentationManually: mockAdvanceDailyWarmup,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientPractice: { record: mockRecord },
    patientHomeBlocks: {},
    contentPages: {},
    contentSections: {},
    systemSettings: { getSetting: vi.fn() },
    patientDailyWarmupPresentation: {},
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

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/patient/practice/completion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/patient/practice/completion", () => {
  beforeEach(() => {
    mockRequirePatientApiBusinessAccess.mockReset();
    mockRecord.mockReset();
    mockAdvanceDailyWarmup.mockReset();
    mockRequirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: SESSION });
    mockRecord.mockResolvedValue({ ok: true, id: "completion-1" });
    mockAdvanceDailyWarmup.mockResolvedValue({ advanced: true, nextContentPageId: "next" });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await POST(makeRequest({ contentPageId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", source: "section_page" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makeRequest({ contentPageId: "not-a-uuid", source: "section_page" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content page invalid", async () => {
    mockRecord.mockResolvedValue({ ok: false, error: "invalid_content_page" });
    const res = await POST(
      makeRequest({
        contentPageId: "550e8400-e29b-41d4-a716-446655440001",
        source: "section_page",
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_content_page");
  });

  it("does not advance warmup presentation for non-daily_warmup source", async () => {
    const res = await POST(
      makeRequest({
        contentPageId: "550e8400-e29b-41d4-a716-446655440002",
        source: "section_page",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockAdvanceDailyWarmup).not.toHaveBeenCalled();
  });

  it("returns 200 with id", async () => {
    const res = await POST(
      makeRequest({
        contentPageId: "550e8400-e29b-41d4-a716-446655440002",
        source: "daily_warmup",
        feeling: 3,
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.id).toBe("completion-1");
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: SESSION.user.userId,
        contentPageId: "550e8400-e29b-41d4-a716-446655440002",
        source: "daily_warmup",
        feeling: 3,
      }),
    );
    expect(mockAdvanceDailyWarmup).toHaveBeenCalledWith(
      SESSION.user.userId,
      "550e8400-e29b-41d4-a716-446655440002",
      expect.any(Object),
    );
  });

  it("accepts daily_warmup with feeling null for two-step modal flow", async () => {
    const res = await POST(
      makeRequest({
        contentPageId: "550e8400-e29b-41d4-a716-446655440003",
        source: "daily_warmup",
        feeling: null,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "daily_warmup",
        feeling: null,
        contentPageId: "550e8400-e29b-41d4-a716-446655440003",
      }),
    );
  });
});
