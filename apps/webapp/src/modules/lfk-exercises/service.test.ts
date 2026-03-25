import { describe, expect, it, beforeEach } from "vitest";
import { createLfkExercisesService } from "./service";
import {
  inMemoryLfkExercisesPort,
  resetInMemoryLfkExercisesStore,
} from "@/infra/repos/inMemoryLfkExercises";

describe("lfk-exercises service", () => {
  beforeEach(() => {
    resetInMemoryLfkExercisesStore();
  });

  it("listExercises applies filters", async () => {
    const port = inMemoryLfkExercisesPort;
    await port.create(
      {
        title: "A",
        loadType: "strength",
        difficulty1_10: 5,
        tags: ["колено"],
      },
      null
    );
    await port.create(
      {
        title: "B stretch",
        loadType: "stretch",
        difficulty1_10: 3,
      },
      null
    );
    const svc = createLfkExercisesService(port);
    const strength = await svc.listExercises({ loadType: "strength" });
    expect(strength).toHaveLength(1);
    expect(strength[0].title).toBe("A");

    const found = await svc.listExercises({ search: "stretch" });
    expect(found.some((e) => e.title.includes("stretch"))).toBe(true);
  });

  it("createExercise rejects empty title", async () => {
    const svc = createLfkExercisesService(inMemoryLfkExercisesPort);
    await expect(svc.createExercise({ title: "  " }, null)).rejects.toThrow(/обязательно/);
  });

  it("archiveExercise marks archived and list hides by default", async () => {
    const port = inMemoryLfkExercisesPort;
    const ex = await port.create({ title: "X" }, null);
    const svc = createLfkExercisesService(port);
    await svc.archiveExercise(ex.id);
    const listed = await svc.listExercises({});
    expect(listed.some((e) => e.id === ex.id)).toBe(false);
    const all = await svc.listExercises({ includeArchived: true });
    expect(all.find((e) => e.id === ex.id)?.isArchived).toBe(true);
  });
});
