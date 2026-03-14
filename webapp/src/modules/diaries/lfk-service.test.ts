import { describe, expect, it } from "vitest";
import { createLfkDiaryService } from "./lfk-service";
import { inMemoryLfkDiaryPort } from "@/infra/repos/lfkDiary";

describe("LFK diary service", () => {
  const { addLfkCompletion, listLfkCompletions } = createLfkDiaryService(inMemoryLfkDiaryPort);

  it("adds completion and lists by userId", () => {
    const e = addLfkCompletion({
      userId: "u1",
      exerciseId: "neck-warmup",
      exerciseTitle: "Разминка для шеи",
    });
    expect(e.id).toBeDefined();
    expect(e.exerciseId).toBe("neck-warmup");
    expect(e.completedAt).toBeDefined();

    const list = listLfkCompletions("u1");
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((x) => x.id === e.id)).toBe(true);
  });

  it("returns empty list for unknown userId", () => {
    const list = listLfkCompletions("unknown-user-999");
    expect(Array.isArray(list)).toBe(true);
  });
});
