import { describe, expect, it } from "vitest";
import { createLfkDiaryService } from "./lfk-service";
import { inMemoryLfkDiaryPort } from "@/infra/repos/lfkDiary";

describe("LFK diary service", () => {
  const service = createLfkDiaryService(inMemoryLfkDiaryPort);

  it("createComplex + addLfkSession and list by userId", async () => {
    const complex = await service.createComplex({ userId: "u1", title: "Разминка" });
    expect(complex.id).toBeDefined();
    const s = await service.addLfkSession({
      userId: "u1",
      complexId: complex.id,
      source: "webapp",
    });
    expect(s.id).toBeDefined();
    expect(s.userId).toBe("u1");
    expect(s.complexId).toBe(complex.id);
    expect(s.completedAt).toBeDefined();

    const list = await service.listLfkSessions("u1");
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((x) => x.id === s.id)).toBe(true);
  });

  it("returns empty list for unknown userId", async () => {
    const list = await service.listLfkSessions("unknown-user-999");
    expect(Array.isArray(list)).toBe(true);
  });

  it("addSession returns session with complexTitle from complex", async () => {
    const complex = await service.createComplex({
      userId: "u1",
      title: "Разминка для шеи",
    });
    const s = await service.addLfkSession({
      userId: "u1",
      complexId: complex.id,
      source: "bot",
    });
    expect(s.complexId).toBe(complex.id);
    expect(s.complexTitle).toBe("Разминка для шеи");
    expect(s.source).toBe("bot");
  });

  it("uses default completedAt when not provided", async () => {
    const complex = await service.createComplex({ userId: "u1", title: "X" });
    const before = new Date().toISOString();
    const s = await service.addLfkSession({
      userId: "u1",
      complexId: complex.id,
      source: "webapp",
    });
    const after = new Date().toISOString();
    expect(s.completedAt >= before && s.completedAt <= after).toBe(true);
  });

  it("list returns sessions in descending completedAt order", async () => {
    const userId = "u-order";
    const complex = await service.createComplex({ userId, title: "Y" });
    const s1 = await service.addLfkSession({
      userId,
      complexId: complex.id,
      completedAt: "2025-01-01T10:00:00Z",
      source: "webapp",
    });
    const s2 = await service.addLfkSession({
      userId,
      complexId: complex.id,
      completedAt: "2025-01-02T10:00:00Z",
      source: "webapp",
    });
    const list = await service.listLfkSessions(userId);
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ours = list.filter((x) => [s1.id, s2.id].includes(x.id));
    expect(ours[0].completedAt).toBe("2025-01-02T10:00:00Z");
    expect(ours[1].completedAt).toBe("2025-01-01T10:00:00Z");
  });

  it("respects list limit", async () => {
    const userId = "u-limit";
    const complex = await service.createComplex({ userId, title: "Z" });
    await service.addLfkSession({
      userId,
      complexId: complex.id,
      completedAt: "2025-01-01T10:00:00Z",
      source: "webapp",
    });
    await service.addLfkSession({
      userId,
      complexId: complex.id,
      completedAt: "2025-01-02T10:00:00Z",
      source: "webapp",
    });
    await service.addLfkSession({
      userId,
      complexId: complex.id,
      completedAt: "2025-01-03T10:00:00Z",
      source: "webapp",
    });
    const list = await service.listLfkSessions(userId, 2);
    expect(list.length).toBe(2);
  });
});
