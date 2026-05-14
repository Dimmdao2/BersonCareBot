/**
 * E2E (in-process): врачебный справочник упражнений ЛФК — CRUD через сервис.
 * RSC list page — в smoke-app-router-rsc-pages-inprocess.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { resetInMemoryLfkExercisesStore } from "@/infra/repos/inMemoryLfkExercises";

describe("lfk exercises doctor e2e (in-process)", () => {
  beforeEach(() => {
    resetInMemoryLfkExercisesStore();
  });

  it("create exercise → list → archive → hidden from list (in-memory service)", async () => {
    const { createLfkExercisesService } = await import("@/modules/lfk-exercises/service");
    const { inMemoryLfkExercisesPort } = await import("@/infra/repos/inMemoryLfkExercises");
    const svc = createLfkExercisesService(inMemoryLfkExercisesPort);
    const ex = await svc.createExercise({ title: "E2E Squat", loadType: "strength" }, "doc-1");
    const listed = await svc.listExercises({});
    expect(listed.some((e) => e.id === ex.id)).toBe(true);
    await svc.archiveExercise(ex.id);
    const after = await svc.listExercises({});
    expect(after.some((e) => e.id === ex.id)).toBe(false);
  });
});
