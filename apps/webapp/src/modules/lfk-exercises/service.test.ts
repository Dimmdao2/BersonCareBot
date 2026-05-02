import { describe, expect, it, beforeEach } from "vitest";
import {
  ExerciseArchiveAlreadyArchivedError,
  ExerciseArchiveNotFoundError,
  ExerciseUnarchiveNotArchivedError,
  UsageConfirmationRequiredError,
} from "./errors";
import { createLfkExercisesService } from "./service";
import { EMPTY_EXERCISE_USAGE_SNAPSHOT } from "./types";
import {
  inMemoryLfkExercisesPort,
  resetInMemoryLfkExercisesStore,
  seedInMemoryExerciseUsageSnapshot,
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

  it("getExerciseUsage delegates to port snapshot", async () => {
    const port = inMemoryLfkExercisesPort;
    const ex = await port.create({ title: "U" }, null);
    seedInMemoryExerciseUsageSnapshot(ex.id, {
      ...EMPTY_EXERCISE_USAGE_SNAPSHOT,
      publishedLfkComplexTemplateCount: 2,
    });
    const svc = createLfkExercisesService(port);
    const u = await svc.getExerciseUsage(ex.id);
    expect(u.publishedLfkComplexTemplateCount).toBe(2);
  });

  it("archiveExercise requires acknowledgement when blocking usage exists", async () => {
    const port = inMemoryLfkExercisesPort;
    const ex = await port.create({ title: "Y" }, null);
    seedInMemoryExerciseUsageSnapshot(ex.id, {
      ...EMPTY_EXERCISE_USAGE_SNAPSHOT,
      activeTreatmentProgramInstanceCount: 1,
    });
    const svc = createLfkExercisesService(port);
    await expect(svc.archiveExercise(ex.id)).rejects.toBeInstanceOf(UsageConfirmationRequiredError);
  });

  it("archiveExercise succeeds with acknowledgement when blocking usage exists", async () => {
    const port = inMemoryLfkExercisesPort;
    const ex = await port.create({ title: "Z" }, null);
    seedInMemoryExerciseUsageSnapshot(ex.id, {
      ...EMPTY_EXERCISE_USAGE_SNAPSHOT,
      publishedTreatmentProgramTemplateCount: 1,
    });
    const svc = createLfkExercisesService(port);
    await svc.archiveExercise(ex.id, { acknowledgeUsageWarning: true });
    const all = await svc.listExercises({ includeArchived: true });
    expect(all.find((e) => e.id === ex.id)?.isArchived).toBe(true);
  });

  it("archiveExercise throws ExerciseArchiveNotFoundError for unknown id", async () => {
    const svc = createLfkExercisesService(inMemoryLfkExercisesPort);
    await expect(svc.archiveExercise("00000000-0000-4000-8000-000000000001")).rejects.toBeInstanceOf(
      ExerciseArchiveNotFoundError,
    );
  });

  it("archiveExercise throws ExerciseArchiveAlreadyArchivedError when already archived", async () => {
    const port = inMemoryLfkExercisesPort;
    const ex = await port.create({ title: "Archived twice" }, null);
    const svc = createLfkExercisesService(port);
    await svc.archiveExercise(ex.id);
    await expect(svc.archiveExercise(ex.id)).rejects.toBeInstanceOf(ExerciseArchiveAlreadyArchivedError);
  });

  it("unarchiveExercise clears isArchived", async () => {
    const port = inMemoryLfkExercisesPort;
    const ex = await port.create({ title: "Back" }, null);
    const svc = createLfkExercisesService(port);
    await svc.archiveExercise(ex.id);
    await svc.unarchiveExercise(ex.id);
    expect((await svc.getExercise(ex.id))?.isArchived).toBe(false);
    const activeList = await svc.listExercises({ archiveListScope: "active" });
    expect(activeList.some((e) => e.id === ex.id)).toBe(true);
  });

  it("unarchiveExercise throws ExerciseUnarchiveNotArchivedError when not archived", async () => {
    const port = inMemoryLfkExercisesPort;
    const ex = await port.create({ title: "Live" }, null);
    const svc = createLfkExercisesService(port);
    await expect(svc.unarchiveExercise(ex.id)).rejects.toBeInstanceOf(ExerciseUnarchiveNotArchivedError);
  });

  it("listExercises archiveListScope archived returns only archived", async () => {
    const port = inMemoryLfkExercisesPort;
    const a = await port.create({ title: "Active one" }, null);
    const b = await port.create({ title: "Gone" }, null);
    const svc = createLfkExercisesService(port);
    await svc.archiveExercise(b.id);
    const archivedOnly = await svc.listExercises({ archiveListScope: "archived" });
    expect(archivedOnly.every((e) => e.isArchived)).toBe(true);
    expect(archivedOnly.some((e) => e.id === b.id)).toBe(true);
    expect(archivedOnly.some((e) => e.id === a.id)).toBe(false);
  });

  it("updateExercise throws when exercise is archived", async () => {
    const port = inMemoryLfkExercisesPort;
    const ex = await port.create({ title: "No edit" }, null);
    const svc = createLfkExercisesService(port);
    await svc.archiveExercise(ex.id);
    await expect(svc.updateExercise(ex.id, { title: "Nope" })).rejects.toThrow(/архиве/);
  });
});
