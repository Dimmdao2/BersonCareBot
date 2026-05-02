import { describe, expect, it, beforeEach } from "vitest";
import {
  LfkTemplateUsageConfirmationRequiredError,
  TemplateArchiveAlreadyArchivedError,
  TemplateArchiveNotFoundError,
  TemplateUnarchiveNotArchivedError,
} from "./errors";
import { createLfkTemplatesService } from "./service";
import {
  inMemoryLfkTemplatesPort,
  resetInMemoryLfkTemplatesStore,
  seedInMemoryLfkTemplateUsageSnapshot,
} from "@/infra/repos/inMemoryLfkTemplates";
import { EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT } from "./types";

describe("lfk-templates service", () => {
  beforeEach(() => {
    resetInMemoryLfkTemplatesStore();
  });

  it("getTemplateUsage delegates to port snapshot", async () => {
    const port = inMemoryLfkTemplatesPort;
    const t = await port.create({ title: "U" }, null);
    seedInMemoryLfkTemplateUsageSnapshot(t.id, {
      ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT,
      activePatientLfkAssignmentCount: 3,
    });
    const svc = createLfkTemplatesService(port);
    const u = await svc.getTemplateUsage(t.id);
    expect(u.activePatientLfkAssignmentCount).toBe(3);
  });

  it("archiveTemplate requires acknowledgement when blocking usage exists", async () => {
    const port = inMemoryLfkTemplatesPort;
    const t = await port.create({ title: "Y" }, null);
    seedInMemoryLfkTemplateUsageSnapshot(t.id, {
      ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT,
      publishedTreatmentProgramTemplateCount: 1,
    });
    const svc = createLfkTemplatesService(port);
    await expect(svc.archiveTemplate(t.id)).rejects.toBeInstanceOf(LfkTemplateUsageConfirmationRequiredError);
  });

  it("archiveTemplate succeeds with acknowledgement when blocking usage exists", async () => {
    const port = inMemoryLfkTemplatesPort;
    const t = await port.create({ title: "Z" }, null);
    seedInMemoryLfkTemplateUsageSnapshot(t.id, {
      ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT,
      activeTreatmentProgramInstanceCount: 1,
    });
    const svc = createLfkTemplatesService(port);
    await svc.archiveTemplate(t.id, { acknowledgeUsageWarning: true });
    const got = await svc.getTemplate(t.id);
    expect(got?.status).toBe("archived");
  });

  it("archiveTemplate succeeds without acknowledgement when only draft program templates reference", async () => {
    const port = inMemoryLfkTemplatesPort;
    const t = await port.create({ title: "DraftOnly" }, null);
    seedInMemoryLfkTemplateUsageSnapshot(t.id, {
      ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT,
      draftTreatmentProgramTemplateCount: 2,
      completedTreatmentProgramInstanceCount: 1,
    });
    const svc = createLfkTemplatesService(port);
    await svc.archiveTemplate(t.id);
    expect((await svc.getTemplate(t.id))?.status).toBe("archived");
  });

  it("archiveTemplate throws TemplateArchiveNotFoundError for unknown id", async () => {
    const svc = createLfkTemplatesService(inMemoryLfkTemplatesPort);
    await expect(svc.archiveTemplate("00000000-0000-4000-8000-000000000001")).rejects.toBeInstanceOf(
      TemplateArchiveNotFoundError,
    );
  });

  it("archiveTemplate throws TemplateArchiveAlreadyArchivedError when already archived", async () => {
    const port = inMemoryLfkTemplatesPort;
    const t = await port.create({ title: "Twice" }, null);
    const svc = createLfkTemplatesService(port);
    await svc.archiveTemplate(t.id);
    await expect(svc.archiveTemplate(t.id)).rejects.toBeInstanceOf(TemplateArchiveAlreadyArchivedError);
  });

  it("unarchiveTemplate sets status to draft", async () => {
    const port = inMemoryLfkTemplatesPort;
    const t = await port.create({ title: "Back" }, null);
    const svc = createLfkTemplatesService(port);
    await svc.archiveTemplate(t.id);
    await svc.unarchiveTemplate(t.id);
    expect((await svc.getTemplate(t.id))?.status).toBe("draft");
  });

  it("unarchiveTemplate throws TemplateUnarchiveNotArchivedError when not archived", async () => {
    const port = inMemoryLfkTemplatesPort;
    const t = await port.create({ title: "Live" }, null);
    const svc = createLfkTemplatesService(port);
    await expect(svc.unarchiveTemplate(t.id)).rejects.toBeInstanceOf(TemplateUnarchiveNotArchivedError);
  });

  it("getTemplateUsage returns empty snapshot for unknown template (in-memory)", async () => {
    const svc = createLfkTemplatesService(inMemoryLfkTemplatesPort);
    const u = await svc.getTemplateUsage("00000000-0000-4000-8000-000000000099");
    expect(u.activePatientLfkAssignmentCount).toBe(0);
    expect(u.publishedTreatmentProgramTemplateCount).toBe(0);
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
