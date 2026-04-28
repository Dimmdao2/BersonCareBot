import { describe, expect, it, vi } from "vitest";
import { createPatientMoodService } from "./service";
import type { PatientMoodPort } from "./ports";

function createPort(): PatientMoodPort {
  return {
    upsertForDate: vi.fn(async (input) => ({ ...input })),
    getForDate: vi.fn(async (userId, moodDate) => ({ userId, moodDate, score: 4 as const })),
  };
}

describe("createPatientMoodService", () => {
  it("validates score before upsert", async () => {
    const service = createPatientMoodService(createPort());
    await expect(service.upsertToday("u1", "Europe/Moscow", 0)).rejects.toThrow("invalid_mood_score");
    await expect(service.upsertToday("u1", "Europe/Moscow", 6)).rejects.toThrow("invalid_mood_score");
    await expect(service.upsertToday("u1", "Europe/Moscow", 2.5)).rejects.toThrow("invalid_mood_score");
  });

  it("upserts and returns today's mood", async () => {
    const port = createPort();
    const service = createPatientMoodService(port);
    const result = await service.upsertToday("u1", "Europe/Moscow", 5);
    expect(result.score).toBe(5);
    expect(port.upsertForDate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        score: 5,
      }),
    );
  });

  it("gets today's mood by computed moodDate", async () => {
    const port = createPort();
    const service = createPatientMoodService(port);
    const result = await service.getToday("u1", "Europe/Moscow");
    expect(result).toEqual(expect.objectContaining({ score: 4 }));
    expect(port.getForDate).toHaveBeenCalledWith("u1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });
});
