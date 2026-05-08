import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createPatientMoodService } from "./service";
import type { PatientWellbeingMoodDeps } from "./wellbeingMoodService";
import { GENERAL_WELLBEING_SYMPTOM_KEY, GENERAL_WELLBEING_TITLE } from "./wellbeingConstants";

const trackingId = "t1";

function makeDeps(overrides?: {
  entriesGlob?: Array<{
    id: string;
    value0_10: number;
    recordedAt: string;
  }>;
  entriesInRange?: Array<{
    id: string;
    value0_10: number;
    recordedAt: string;
    entryType?: "instant" | "daily";
  }>;
}) {
  const listSymptomEntriesForUserInRange = vi.fn(async () => {
    const rows = overrides?.entriesGlob ?? [];
    return rows.map((r) => ({
      id: r.id,
      userId: "u1",
      trackingId,
      value0_10: r.value0_10,
      entryType: "instant" as const,
      recordedAt: r.recordedAt,
      source: "webapp" as const,
      notes: null,
      createdAt: r.recordedAt,
    }));
  });
  const listSymptomEntriesForTrackingInRange = vi.fn(async () => {
    const rows = overrides?.entriesInRange ?? [];
    return rows.map((r) => ({
      id: r.id,
      userId: "u1",
      trackingId,
      value0_10: r.value0_10,
      entryType: r.entryType ?? ("instant" as const),
      recordedAt: r.recordedAt,
      source: "webapp" as const,
      notes: null,
      createdAt: r.recordedAt,
    }));
  });
  const addEntry = vi.fn(async (p: { value0_10: number; recordedAt: string }) => ({
    id: "new-entry",
    userId: "u1",
    trackingId,
    value0_10: p.value0_10,
    entryType: "instant" as const,
    recordedAt: p.recordedAt,
    source: "webapp" as const,
    notes: null,
    createdAt: p.recordedAt,
  }));
  const updateSymptomEntry = vi.fn(async () => {});

  return {
    diaries: {
      listTrackings: vi.fn(async () => [
        {
          id: trackingId,
          userId: "u1",
          symptomKey: GENERAL_WELLBEING_SYMPTOM_KEY,
          symptomTitle: GENERAL_WELLBEING_TITLE,
          isActive: true,
          createdAt: "",
          updatedAt: "",
        },
      ]),
      createTracking: vi.fn(),
      listSymptomEntriesForUserInRange,
      listSymptomEntriesForTrackingInRange,
      addEntry,
      updateSymptomEntry,
    },
    references: {
      listActiveItemsByCategoryCode: vi.fn(async () => [
        { id: "ref-gw", code: GENERAL_WELLBEING_SYMPTOM_KEY, title: GENERAL_WELLBEING_TITLE },
      ]),
      findItemById: vi.fn(),
    },
  } as unknown as PatientWellbeingMoodDeps;
}

describe("createPatientMoodService (wellbeing / symptom_entries)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submitScore rejects non-integer and out-of-range scores", async () => {
    const deps = makeDeps();
    const svc = createPatientMoodService(deps);
    await expect(svc.submitScore("u1", "UTC", 0, "auto")).resolves.toMatchObject({ ok: false, error: "invalid_score" });
    await expect(svc.submitScore("u1", "UTC", 6, "auto")).resolves.toMatchObject({ ok: false, error: "invalid_score" });
    await expect(svc.submitScore("u1", "UTC", 2.5, "auto")).resolves.toMatchObject({ ok: false, error: "invalid_score" });
    expect(deps.diaries.addEntry).not.toHaveBeenCalled();
  });

  it("submitScore with no prior entry inserts a new row", async () => {
    const deps = makeDeps({ entriesGlob: [] });
    const svc = createPatientMoodService(deps);
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const r = await svc.submitScore("u1", "Europe/Moscow", 3, "auto", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.addEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        trackingId,
        value0_10: 3,
        entryType: "instant",
        recordedAt: new Date(nowMs).toISOString(),
        source: "webapp",
      }),
    );
    expect(deps.diaries.updateSymptomEntry).not.toHaveBeenCalled();
  });

  it("when last entry is under 10 minutes old, auto updates same row and keeps recorded_at", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - 5 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 2, recordedAt: lastAt }],
      entriesInRange: [{ id: "e1", value0_10: 2, recordedAt: lastAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "Europe/Moscow", 4, "auto", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.updateSymptomEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: "e1",
        value0_10: 4,
        recordedAt: lastAt,
      }),
    );
    expect(deps.diaries.addEntry).not.toHaveBeenCalled();
  });

  it("in 10–60 min window, auto returns intent_required", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - 20 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 3, recordedAt: lastAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "UTC", 5, "auto", nowMs);
    expect(r).toEqual({
      ok: false,
      error: "intent_required",
      lastEntry: { id: "e1", recordedAt: lastAt, score: 3 },
    });
  });

  it("in 10–60 min window, replace_last updates last entry", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - 20 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 3, recordedAt: lastAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "UTC", 5, "replace_last", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.updateSymptomEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: "e1",
        value0_10: 5,
        recordedAt: new Date(nowMs).toISOString(),
      }),
    );
  });

  it("in 10–60 min window, new_instant adds a row", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - 20 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 3, recordedAt: lastAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "UTC", 5, "new_instant", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.addEntry).toHaveBeenCalled();
    expect(deps.diaries.updateSymptomEntry).not.toHaveBeenCalled();
  });

  it("at exactly 10 minutes, auto still replaces last row (inclusive bound)", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - 10 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 2, recordedAt: lastAt }],
      entriesInRange: [{ id: "e1", value0_10: 2, recordedAt: lastAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "Europe/Moscow", 4, "auto", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.updateSymptomEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "e1", recordedAt: lastAt }),
    );
    expect(deps.diaries.addEntry).not.toHaveBeenCalled();
  });

  it("at exactly 60 minutes, auto returns intent_required (inclusive modal bound)", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - 60 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 3, recordedAt: lastAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "UTC", 5, "auto", nowMs);
    expect(r).toEqual({
      ok: false,
      error: "intent_required",
      lastEntry: { id: "e1", recordedAt: lastAt, score: 3 },
    });
  });

  it("just over 60 minutes, auto adds new instant entry", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - (60 * 60 * 1000 + 1)).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 3, recordedAt: lastAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "UTC", 5, "auto", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.addEntry).toHaveBeenCalled();
  });

  it("when latest value is outside 1–5, still updates that row in silent window", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - 5 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 7, recordedAt: lastAt }],
      entriesInRange: [{ id: "e1", value0_10: 7, recordedAt: lastAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "Europe/Moscow", 4, "auto", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.updateSymptomEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "e1", value0_10: 4, recordedAt: lastAt }),
    );
    expect(deps.diaries.addEntry).not.toHaveBeenCalled();
  });

  it("getCheckinState: lastEntry.score null when latest value invalid, mood null", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-05-08T12:00:00.000Z"));
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 7, recordedAt: "2026-05-08T08:00:00.000Z" }],
      entriesInRange: [{ id: "e1", value0_10: 7, recordedAt: "2026-05-08T08:00:00.000Z" }],
    });
    const svc = createPatientMoodService(deps);
    const state = await svc.getCheckinState("u1", "Europe/Moscow");
    expect(state.mood).toBeNull();
    expect(state.lastEntry).toEqual({
      id: "e1",
      recordedAt: "2026-05-08T08:00:00.000Z",
      score: null,
    });
    vi.useRealTimers();
  });

  it("after 60 minutes, replace_last is rejected", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - (60 * 60 * 1000 + 1)).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 3, recordedAt: lastAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "UTC", 5, "replace_last", nowMs);
    expect(r).toMatchObject({ ok: false, error: "replace_too_old" });
    expect(deps.diaries.addEntry).not.toHaveBeenCalled();
  });

  it("after 60 minutes, auto adds new instant entry", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - (60 * 60 * 1000 + 1)).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 3, recordedAt: lastAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "UTC", 5, "auto", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.addEntry).toHaveBeenCalled();
  });

  it("getCheckinState returns today mood from latest entry on local day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-05-08T12:00:00.000Z"));
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 4, recordedAt: "2026-05-08T08:00:00.000Z" }],
      entriesInRange: [{ id: "e1", value0_10: 4, recordedAt: "2026-05-08T08:00:00.000Z" }],
    });
    const svc = createPatientMoodService(deps);
    const state = await svc.getCheckinState("u1", "Europe/Moscow");
    expect(state.mood).toEqual({ moodDate: "2026-05-08", score: 4 });
    vi.useRealTimers();
  });
});
