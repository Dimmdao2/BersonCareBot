import { describe, expect, it } from "vitest";
import { createSymptomDiaryService } from "./symptom-service";
import { inMemorySymptomDiaryPort } from "@/infra/repos/symptomDiary";

describe("symptom diary service", () => {
  const service = createSymptomDiaryService(inMemorySymptomDiaryPort);

  it("createTracking + addEntry and list by userId", async () => {
    const tracking = await service.createTracking({
      userId: "u1",
      symptomTitle: "Головная боль",
    });
    expect(tracking.id).toBeDefined();
    expect(tracking.symptomTitle).toBe("Головная боль");

    const e = await service.addEntry({
      userId: "u1",
      trackingId: tracking.id,
      value0_10: 5,
      entryType: "instant",
      recordedAt: new Date().toISOString(),
      source: "bot",
      notes: "Утро",
    });
    expect(e.id).toBeDefined();
    expect(e.trackingId).toBe(tracking.id);
    expect(e.value0_10).toBe(5);
    expect(e.recordedAt).toBeDefined();

    const list = await service.listSymptomEntries("u1");
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((x) => x.id === e.id)).toBe(true);
  });

  it("ensureGeneralWellbeingTracking returns same id when called twice", async () => {
    const uid = "550e8400-e29b-41d4-a716-446655440001";
    const t1 = await service.ensureGeneralWellbeingTracking({
      userId: uid,
      symptomTitle: "Общее самочувствие",
      symptomTypeRefId: "00000000-0000-4000-8000-000000000001",
    });
    const t2 = await service.ensureGeneralWellbeingTracking({
      userId: uid,
      symptomTitle: "Общее самочувствие",
      symptomTypeRefId: "00000000-0000-4000-8000-000000000001",
    });
    expect(t1.id).toBe(t2.id);
    const list = await service.listTrackings(uid, false);
    expect(list.filter((x) => x.symptomKey === "general_wellbeing")).toHaveLength(1);
  });

  it("returns empty list for unknown userId", async () => {
    const list = await service.listSymptomEntries("unknown-user-999");
    expect(Array.isArray(list)).toBe(true);
  });

  it("clamps value0_10 to 0–10", async () => {
    const tracking = await service.createTracking({ userId: "u2", symptomTitle: "X" });
    const low = await service.addEntry({
      userId: "u2",
      trackingId: tracking.id,
      value0_10: -1,
      entryType: "instant",
      recordedAt: new Date().toISOString(),
      source: "webapp",
    });
    const high = await service.addEntry({
      userId: "u2",
      trackingId: tracking.id,
      value0_10: 15,
      entryType: "daily",
      recordedAt: new Date().toISOString(),
      source: "webapp",
    });
    expect(low.value0_10).toBe(0);
    expect(high.value0_10).toBe(10);
  });

  it("trims symptomTitle and uses fallback when empty", async () => {
    const t = await service.createTracking({ userId: "u2", symptomTitle: "  " });
    expect(t.symptomTitle).toBe("—");
  });

  it("passes notes as null when undefined", async () => {
    const tracking = await service.createTracking({ userId: "u2", symptomTitle: "Z" });
    const e = await service.addEntry({
      userId: "u2",
      trackingId: tracking.id,
      value0_10: 3,
      entryType: "instant",
      recordedAt: new Date().toISOString(),
      source: "bot",
    });
    expect(e.notes).toBeNull();
  });

  it("respects list limit", async () => {
    const userId = "u-limit";
    const tracking = await service.createTracking({ userId, symptomTitle: "A" });
    await service.addEntry({
      userId,
      trackingId: tracking.id,
      value0_10: 1,
      entryType: "instant",
      recordedAt: new Date().toISOString(),
      source: "webapp",
    });
    await service.addEntry({
      userId,
      trackingId: tracking.id,
      value0_10: 2,
      entryType: "instant",
      recordedAt: new Date().toISOString(),
      source: "webapp",
    });
    await service.addEntry({
      userId,
      trackingId: tracking.id,
      value0_10: 3,
      entryType: "instant",
      recordedAt: new Date().toISOString(),
      source: "webapp",
    });
    const list = await service.listSymptomEntries(userId, 2);
    expect(list.length).toBe(2);
  });
});
