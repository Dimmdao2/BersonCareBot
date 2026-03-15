import { describe, expect, it } from "vitest";
import { createSymptomDiaryService } from "./symptom-service";
import { inMemorySymptomDiaryPort } from "@/infra/repos/symptomDiary";

describe("symptom diary service", () => {
  const { addSymptomEntry, listSymptomEntries } = createSymptomDiaryService(inMemorySymptomDiaryPort);

  it("adds entry and lists by userId", async () => {
    const e = await addSymptomEntry({
      userId: "u1",
      symptom: "Головная боль",
      severity: 3,
      notes: "Утро",
    });
    expect(e.id).toBeDefined();
    expect(e.symptom).toBe("Головная боль");
    expect(e.severity).toBe(3);
    expect(e.recordedAt).toBeDefined();

    const list = await listSymptomEntries("u1");
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((x) => x.id === e.id)).toBe(true);
  });

  it("returns empty list for unknown userId", async () => {
    const list = await listSymptomEntries("unknown-user-999");
    expect(Array.isArray(list)).toBe(true);
  });

  it("clamps severity to 1–5", async () => {
    const low = await addSymptomEntry({ userId: "u2", symptom: "X", severity: 0 as 1 });
    const high = await addSymptomEntry({ userId: "u2", symptom: "Y", severity: 6 as 1 });
    expect(low.severity).toBe(1);
    expect(high.severity).toBe(5);
  });

  it("trims symptom and uses fallback when empty", async () => {
    const e = await addSymptomEntry({ userId: "u2", symptom: "  ", severity: 2 });
    expect(e.symptom).toBe("—");
  });

  it("passes notes as null when undefined", async () => {
    const e = await addSymptomEntry({ userId: "u2", symptom: "Z", severity: 1 });
    expect(e.notes).toBeNull();
  });

  it("respects list limit", async () => {
    const userId = "u-limit";
    await addSymptomEntry({ userId, symptom: "A", severity: 1 });
    await addSymptomEntry({ userId, symptom: "B", severity: 2 });
    await addSymptomEntry({ userId, symptom: "C", severity: 3 });
    const list = await listSymptomEntries(userId, 2);
    expect(list.length).toBe(2);
  });
});
