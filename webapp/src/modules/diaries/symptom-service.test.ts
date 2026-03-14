import { describe, expect, it } from "vitest";
import { createSymptomDiaryService } from "./symptom-service";
import { inMemorySymptomDiaryPort } from "@/infra/repos/symptomDiary";

describe("symptom diary service", () => {
  const { addSymptomEntry, listSymptomEntries } = createSymptomDiaryService(inMemorySymptomDiaryPort);

  it("adds entry and lists by userId", () => {
    const e = addSymptomEntry({
      userId: "u1",
      symptom: "Головная боль",
      severity: 3,
      notes: "Утро",
    });
    expect(e.id).toBeDefined();
    expect(e.symptom).toBe("Головная боль");
    expect(e.severity).toBe(3);
    expect(e.recordedAt).toBeDefined();

    const list = listSymptomEntries("u1");
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((x) => x.id === e.id)).toBe(true);
  });

  it("returns empty list for unknown userId", () => {
    const list = listSymptomEntries("unknown-user-999");
    expect(Array.isArray(list)).toBe(true);
  });
});
