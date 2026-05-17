import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { WELLBEING_GENERAL_MIRROR_NOTE } from "@/modules/diaries/wellbeingGeneralMirrorNote";
import { createPatientMoodService } from "./service";
import type { PatientWellbeingMoodDeps } from "./wellbeingMoodService";
import { GENERAL_WELLBEING_SYMPTOM_KEY, GENERAL_WELLBEING_TITLE } from "./wellbeingConstants";

const trackingIdGeneral = "t1";
const trackingIdWarmup = "tw";

type RangeRow = {
  id: string;
  value0_10: number;
  recordedAt: string;
  entryType?: "instant" | "daily";
  notes?: string | null;
};

function makeDeps(overrides?: {
  entriesGlob?: RangeRow[];
  entriesInRange?: RangeRow[];
  warmupEntriesInRange?: RangeRow[];
}) {
  const mapRow = (r: RangeRow, trackingId: string) => ({
    id: r.id,
    userId: "u1",
    trackingId,
    value0_10: r.value0_10,
    entryType: r.entryType ?? ("instant" as const),
    recordedAt: r.recordedAt,
    source: "webapp" as const,
    notes: r.notes ?? null,
    createdAt: r.recordedAt,
  });

  const listSymptomEntriesForUserInRange = vi.fn(async () => {
    const rows = overrides?.entriesGlob ?? [];
    return rows.map((r) => mapRow(r, trackingIdGeneral));
  });

  const listSymptomEntriesForTrackingInRange = vi.fn(
    async (p: { userId: string; trackingId: string; fromRecordedAt: string; toRecordedAtExclusive: string }) => {
      if (p.trackingId === trackingIdWarmup) {
        const rows = overrides?.warmupEntriesInRange ?? [];
        return rows.map((r) => mapRow(r, trackingIdWarmup));
      }
      const rows = overrides?.entriesInRange ?? overrides?.entriesGlob ?? [];
      return rows.map((r) => mapRow(r, trackingIdGeneral));
    },
  );

  const addEntry = vi.fn(async (p: { value0_10: number; recordedAt: string; notes?: string | null }) => ({
    id: "new-entry",
    userId: "u1",
    trackingId: trackingIdGeneral,
    value0_10: p.value0_10,
    entryType: "instant" as const,
    recordedAt: p.recordedAt,
    source: "webapp" as const,
    notes: p.notes ?? null,
    createdAt: p.recordedAt,
  }));
  const updateSymptomEntry = vi.fn(async () => {});

  return {
    diaries: {
      listTrackings: vi.fn(async () => [
        {
          id: trackingIdGeneral,
          userId: "u1",
          symptomKey: GENERAL_WELLBEING_SYMPTOM_KEY,
          symptomTitle: GENERAL_WELLBEING_TITLE,
          isActive: true,
          createdAt: "",
          updatedAt: "",
        },
      ]),
      ensureGeneralWellbeingTracking: vi.fn(async () => ({
        id: trackingIdGeneral,
        userId: "u1",
        symptomKey: GENERAL_WELLBEING_SYMPTOM_KEY,
        symptomTitle: GENERAL_WELLBEING_TITLE,
        isActive: true,
        createdAt: "",
        updatedAt: "",
        symptomTypeRefId: "ref-gw",
      })),
      ensureWarmupFeelingTracking: vi.fn(async () => ({
        id: trackingIdWarmup,
        userId: "u1",
        symptomKey: "warmup_feeling",
        symptomTitle: "После разминки",
        isActive: true,
        createdAt: "",
        updatedAt: "",
      })),
      createTracking: vi.fn(),
      listSymptomEntriesForUserInRange,
      listSymptomEntriesForTrackingInRange,
      addEntry,
      updateSymptomEntry,
    },
    references: {
      listActiveItemsByCategoryCode: vi.fn(async () => [
        { id: "ref-gw", code: GENERAL_WELLBEING_SYMPTOM_KEY, title: GENERAL_WELLBEING_TITLE },
        { id: "ref-wu", code: "warmup_feeling", title: "После разминки" },
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
        trackingId: trackingIdGeneral,
        value0_10: 3,
        entryType: "instant",
        recordedAt: new Date(nowMs).toISOString(),
        source: "webapp",
      }),
    );
    expect(deps.diaries.updateSymptomEntry).not.toHaveBeenCalled();
  });

  it("when last entry ≤5 min and no recent warmup, auto updates same row", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - 3 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 2, recordedAt: lastAt, notes: null }],
      entriesInRange: [{ id: "e1", value0_10: 2, recordedAt: lastAt, notes: null }],
      warmupEntriesInRange: [],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "Europe/Moscow", 4, "auto", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.updateSymptomEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: "e1",
        value0_10: 4,
        recordedAt: lastAt,
        notes: null,
      }),
    );
    expect(deps.diaries.addEntry).not.toHaveBeenCalled();
  });

  it("when last is warmup mirror ≤5 min and recent warmup, adds new row (does not overwrite mirror)", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const warmupAt = new Date(nowMs - 2 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "mirror", value0_10: 3, recordedAt: warmupAt, notes: WELLBEING_GENERAL_MIRROR_NOTE }],
      entriesInRange: [{ id: "mirror", value0_10: 3, recordedAt: warmupAt, notes: WELLBEING_GENERAL_MIRROR_NOTE }],
      warmupEntriesInRange: [{ id: "w1", value0_10: 3, recordedAt: warmupAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "UTC", 5, "auto", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.addEntry).toHaveBeenCalled();
    expect(deps.diaries.updateSymptomEntry).not.toHaveBeenCalled();
  });

  it("when last ≤5 min, warmup recent, and user general already after warmup → update last only", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const warmupAt = new Date(nowMs - 4 * 60 * 1000).toISOString();
    const userAt = new Date(nowMs - 2 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e2", value0_10: 4, recordedAt: userAt, notes: null }],
      entriesInRange: [
        { id: "mirror", value0_10: 3, recordedAt: warmupAt, notes: WELLBEING_GENERAL_MIRROR_NOTE },
        { id: "e2", value0_10: 4, recordedAt: userAt, notes: null },
      ],
      warmupEntriesInRange: [{ id: "w1", value0_10: 3, recordedAt: warmupAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "UTC", 2, "auto", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.updateSymptomEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "e2", value0_10: 2, recordedAt: userAt, notes: null }),
    );
    expect(deps.diaries.addEntry).not.toHaveBeenCalled();
  });

  it("at exactly 5 minutes from last entry, still in silent window (inclusive)", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - 5 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 2, recordedAt: lastAt, notes: null }],
      entriesInRange: [{ id: "e1", value0_10: 2, recordedAt: lastAt, notes: null }],
      warmupEntriesInRange: [],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "Europe/Moscow", 4, "auto", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.updateSymptomEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "e1", recordedAt: lastAt }),
    );
    expect(deps.diaries.addEntry).not.toHaveBeenCalled();
  });

  it("just over 5 minutes, auto adds new instant entry", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - (5 * 60 * 1000 + 1)).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 3, recordedAt: lastAt }],
    });
    const svc = createPatientMoodService(deps);
    const r = await svc.submitScore("u1", "UTC", 5, "auto", nowMs);
    expect(r.ok).toBe(true);
    expect(deps.diaries.addEntry).toHaveBeenCalled();
    expect(deps.diaries.updateSymptomEntry).not.toHaveBeenCalled();
  });

  it("when latest value is outside 1–5, still updates that row in silent window", async () => {
    const nowMs = Date.parse("2026-05-08T12:00:00.000Z");
    const lastAt = new Date(nowMs - 3 * 60 * 1000).toISOString();
    const deps = makeDeps({
      entriesGlob: [{ id: "e1", value0_10: 7, recordedAt: lastAt, notes: null }],
      entriesInRange: [{ id: "e1", value0_10: 7, recordedAt: lastAt, notes: null }],
      warmupEntriesInRange: [],
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
      notes: null,
    });
    vi.useRealTimers();
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
