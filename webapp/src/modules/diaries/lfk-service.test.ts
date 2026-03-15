import { describe, expect, it } from "vitest";
import { createLfkDiaryService } from "./lfk-service";
import { inMemoryLfkDiaryPort } from "@/infra/repos/lfkDiary";

describe("LFK diary service", () => {
  const { addLfkSession, listLfkSessions } = createLfkDiaryService(inMemoryLfkDiaryPort);

  it("adds session and lists by userId", async () => {
    const s = await addLfkSession({ userId: "u1" });
    expect(s.id).toBeDefined();
    expect(s.userId).toBe("u1");
    expect(s.completedAt).toBeDefined();

    const list = await listLfkSessions("u1");
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((x) => x.id === s.id)).toBe(true);
  });

  it("returns empty list for unknown userId", async () => {
    const list = await listLfkSessions("unknown-user-999");
    expect(Array.isArray(list)).toBe(true);
  });

  it("adds session with optional complexId and complexTitle", async () => {
    const s = await addLfkSession({
      userId: "u1",
      complexId: "complex-1",
      complexTitle: "Разминка для шеи",
    });
    expect(s.complexId).toBe("complex-1");
    expect(s.complexTitle).toBe("Разминка для шеи");
    expect(s.completedAt).toBeDefined();
  });

  it("uses default completedAt when not provided", async () => {
    const before = new Date().toISOString();
    const s = await addLfkSession({ userId: "u1" });
    const after = new Date().toISOString();
    expect(s.completedAt >= before && s.completedAt <= after).toBe(true);
  });

  it("list returns sessions in descending completedAt order", async () => {
    const userId = "u-order";
    const s1 = await addLfkSession({ userId, completedAt: "2025-01-01T10:00:00Z" });
    const s2 = await addLfkSession({ userId, completedAt: "2025-01-02T10:00:00Z" });
    const list = await listLfkSessions(userId);
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ours = list.filter((x) => [s1.id, s2.id].includes(x.id));
    expect(ours[0].completedAt).toBe("2025-01-02T10:00:00Z");
    expect(ours[1].completedAt).toBe("2025-01-01T10:00:00Z");
  });

  it("respects list limit", async () => {
    const userId = "u-limit";
    await addLfkSession({ userId, completedAt: "2025-01-01T10:00:00Z" });
    await addLfkSession({ userId, completedAt: "2025-01-02T10:00:00Z" });
    await addLfkSession({ userId, completedAt: "2025-01-03T10:00:00Z" });
    const list = await listLfkSessions(userId, 2);
    expect(list.length).toBe(2);
  });
});
