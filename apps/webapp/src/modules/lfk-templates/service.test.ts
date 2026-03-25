import { describe, expect, it, beforeEach } from "vitest";
import { createLfkTemplatesService } from "./service";
import {
  inMemoryLfkTemplatesPort,
  resetInMemoryLfkTemplatesStore,
} from "@/infra/repos/inMemoryLfkTemplates";

describe("lfk-templates service", () => {
  beforeEach(() => {
    resetInMemoryLfkTemplatesStore();
  });

  it("publishTemplate fails for empty exercises", async () => {
    const port = inMemoryLfkTemplatesPort;
    const t = await port.create({ title: "T1" }, null);
    const svc = createLfkTemplatesService(port);
    await expect(svc.publishTemplate(t.id)).rejects.toThrow(/упражнение/);
  });

  it("publishTemplate fails for non-draft", async () => {
    const port = inMemoryLfkTemplatesPort;
    const t = await port.create({ title: "T2" }, null);
    await port.setStatus(t.id, "published");
    const svc = createLfkTemplatesService(port);
    await expect(svc.publishTemplate(t.id)).rejects.toThrow(/черновик/);
  });

  it("updateExercises preserves sort order", async () => {
    const port = inMemoryLfkTemplatesPort;
    const t = await port.create({ title: "T3" }, null);
    const svc = createLfkTemplatesService(port);
    await svc.updateExercises(t.id, [
      { exerciseId: "ex-1", sortOrder: 2 },
      { exerciseId: "ex-2", sortOrder: 0 },
      { exerciseId: "ex-3", sortOrder: 1 },
    ]);
    const got = await svc.getTemplate(t.id);
    const ids = got!.exercises.map((e) => e.exerciseId);
    expect(ids).toEqual(["ex-2", "ex-3", "ex-1"]);
  });

  it("updateExercises rejects clearing all exercises on published template", async () => {
    const port = inMemoryLfkTemplatesPort;
    const svc = createLfkTemplatesService(port);
    const t = await port.create({ title: "PubT" }, null);
    await svc.updateExercises(t.id, [{ exerciseId: "ex-1", sortOrder: 0 }]);
    await svc.publishTemplate(t.id);
    await expect(svc.updateExercises(t.id, [])).rejects.toThrow(/опубликованного/);
  });
});
