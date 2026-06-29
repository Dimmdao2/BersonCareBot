/**
 * Tests for GET /api/doctor/patients/[userId]/exercise-calendar
 *
 * Coverage:
 *  - Returns empty days when all three sources have no data
 *  - Returns counts from program_action_log done entries (primary source — bug #204)
 *  - Merges counts from lfk_sessions + practiceCompletions + programActionLog
 *  - Skips daily_warmup completions from practiceCompletions
 *  - Falls back to UTC when patient has no timezone set
 *  - Returns 400 on invalid date params
 *  - Returns 401 when unauthenticated
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Hoist mocks before imports
// ---------------------------------------------------------------------------

const {
  requireDoctorApiSessionMock,
  buildAppDepsMock,
} = vi.hoisted(() => ({
  requireDoctorApiSessionMock: vi.fn(),
  buildAppDepsMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorApiSession: (...args: unknown[]) => requireDoctorApiSessionMock(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: (...args: unknown[]) => buildAppDepsMock(...args),
}));

import { GET } from "./route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOCTOR_SESSION = {
  ok: true as const,
  session: { user: { userId: "doctor-uuid-111", role: "doctor" } },
};

function makeRequest(userId: string, from?: string, to?: string): Request {
  const url = new URL(`http://localhost/api/doctor/patients/${userId}/exercise-calendar`);
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);
  return new Request(url.toString());
}

function makeParams(userId: string): Promise<{ userId: string }> {
  return Promise.resolve({ userId });
}

function makeDeps(overrides: {
  lfkSessions?: Array<{ completedAt: string }>;
  practiceCompletions?: Array<{ completedAt: string; source: string }>;
  programDoneItems?: Array<{ localDate: string; itemId: string; instanceId: string }>;
  patientIana?: string | null;
}) {
  return {
    diaries: {
      listLfkSessionsInRange: vi.fn().mockResolvedValue(overrides.lfkSessions ?? []),
    },
    patientPractice: {
      listByUserInUtcRange: vi.fn().mockResolvedValue(overrides.practiceCompletions ?? []),
    },
    programActionLog: {
      listDoneItemsByLocalDateInWindowForPatient: vi.fn().mockResolvedValue(overrides.programDoneItems ?? []),
    },
    patientCalendarTimezone: {
      getIanaForUser: vi.fn().mockResolvedValue(
        overrides.patientIana !== undefined ? overrides.patientIana : "Europe/Moscow",
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/doctor/patients/[userId]/exercise-calendar", () => {
  const userId = randomUUID();

  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorApiSessionMock.mockResolvedValue(DOCTOR_SESSION);
  });

  it("returns 401 when not authenticated", async () => {
    requireDoctorApiSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    const res = await GET(makeRequest(userId, "2026-06-01", "2026-06-30"), { params: makeParams(userId) });
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid date params", async () => {
    buildAppDepsMock.mockReturnValue(makeDeps({}));
    const res = await GET(makeRequest(userId, "not-a-date", "2026-06-30"), { params: makeParams(userId) });
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_date_params");
  });

  it("returns empty days when all sources are empty", async () => {
    buildAppDepsMock.mockReturnValue(makeDeps({}));
    const res = await GET(makeRequest(userId, "2026-06-01", "2026-06-30"), { params: makeParams(userId) });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; days: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.days).toHaveLength(0);
  });

  it("returns counts from program_action_log done entries (bug #204 primary fix)", async () => {
    const programDoneItems = [
      { localDate: "2026-06-15", itemId: "item-1", instanceId: "inst-1" },
      { localDate: "2026-06-15", itemId: "item-2", instanceId: "inst-1" },
      { localDate: "2026-06-20", itemId: "item-1", instanceId: "inst-1" },
    ];
    buildAppDepsMock.mockReturnValue(makeDeps({ programDoneItems }));
    const res = await GET(makeRequest(userId, "2026-06-01", "2026-06-30"), { params: makeParams(userId) });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; days: Array<{ date: string; completedCount: number }> };
    expect(body.ok).toBe(true);
    expect(body.days).toHaveLength(2);
    const june15 = body.days.find((d) => d.date === "2026-06-15");
    expect(june15?.completedCount).toBe(2);
    const june20 = body.days.find((d) => d.date === "2026-06-20");
    expect(june20?.completedCount).toBe(1);
  });

  it("merges counts from lfk_sessions, practiceCompletions (non-warmup), and programActionLog", async () => {
    const deps = makeDeps({
      lfkSessions: [{ completedAt: "2026-06-10" }],
      practiceCompletions: [
        { completedAt: "2026-06-10T12:00:00Z", source: "program_exercise" },
        { completedAt: "2026-06-10T13:00:00Z", source: "daily_warmup" }, // should be skipped
      ],
      programDoneItems: [
        { localDate: "2026-06-10", itemId: "item-1", instanceId: "inst-1" },
      ],
    });
    buildAppDepsMock.mockReturnValue(deps);
    const res = await GET(makeRequest(userId, "2026-06-01", "2026-06-30"), { params: makeParams(userId) });
    const body = await res.json() as { ok: boolean; days: Array<{ date: string; completedCount: number }> };
    const june10 = body.days.find((d) => d.date === "2026-06-10");
    // lfk: 1, practiceCompletions non-warmup: 1, programDone: 1 → total 3
    expect(june10?.completedCount).toBe(3);
  });

  it("skips daily_warmup completions from practiceCompletions", async () => {
    const deps = makeDeps({
      practiceCompletions: [
        { completedAt: "2026-06-05T10:00:00Z", source: "daily_warmup" },
        { completedAt: "2026-06-05T11:00:00Z", source: "daily_warmup" },
      ],
    });
    buildAppDepsMock.mockReturnValue(deps);
    const res = await GET(makeRequest(userId, "2026-06-01", "2026-06-30"), { params: makeParams(userId) });
    const body = await res.json() as { ok: boolean; days: unknown[] };
    expect(body.days).toHaveLength(0);
  });

  it("falls back to UTC timezone when patient has no timezone set", async () => {
    const deps = makeDeps({ patientIana: null });
    buildAppDepsMock.mockReturnValue(deps);
    await GET(makeRequest(userId, "2026-06-01", "2026-06-30"), { params: makeParams(userId) });
    expect(deps.programActionLog.listDoneItemsByLocalDateInWindowForPatient).toHaveBeenCalledWith(
      expect.objectContaining({ displayIana: "UTC" }),
    );
  });

  it("uses patient's IANA timezone when available", async () => {
    const deps = makeDeps({ patientIana: "Asia/Yekaterinburg" });
    buildAppDepsMock.mockReturnValue(deps);
    await GET(makeRequest(userId, "2026-06-01", "2026-06-30"), { params: makeParams(userId) });
    expect(deps.programActionLog.listDoneItemsByLocalDateInWindowForPatient).toHaveBeenCalledWith(
      expect.objectContaining({ displayIana: "Asia/Yekaterinburg" }),
    );
  });

  it("returns sorted days", async () => {
    const deps = makeDeps({
      programDoneItems: [
        { localDate: "2026-06-25", itemId: "item-1", instanceId: "inst-1" },
        { localDate: "2026-06-03", itemId: "item-2", instanceId: "inst-1" },
        { localDate: "2026-06-15", itemId: "item-3", instanceId: "inst-1" },
      ],
    });
    buildAppDepsMock.mockReturnValue(deps);
    const res = await GET(makeRequest(userId, "2026-06-01", "2026-06-30"), { params: makeParams(userId) });
    const body = await res.json() as { ok: boolean; days: Array<{ date: string }> };
    expect(body.days.map((d) => d.date)).toEqual(["2026-06-03", "2026-06-15", "2026-06-25"]);
  });
});
