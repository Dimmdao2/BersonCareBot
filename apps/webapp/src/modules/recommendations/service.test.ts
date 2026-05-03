import { describe, expect, it, beforeEach } from "vitest";
import { createRecommendationsService } from "./service";
import { RecommendationUnarchiveNotArchivedError, RecommendationUsageConfirmationRequiredError } from "./errors";
import {
  inMemoryRecommendationsPort,
  resetInMemoryRecommendationsStore,
  seedInMemoryRecommendationUsageSnapshot,
} from "@/app-layer/testing/clinicalLibraryInMemory";
import { EMPTY_RECOMMENDATION_USAGE_SNAPSHOT } from "./types";

describe("recommendations service", () => {
  beforeEach(() => {
    resetInMemoryRecommendationsStore();
  });

  it("createRecommendation rejects empty title", async () => {
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    await expect(svc.createRecommendation({ title: "  ", bodyMd: "x" }, null)).rejects.toThrow(/обязательно/);
  });

  it("listRecommendations hides archived", async () => {
    await inMemoryRecommendationsPort.create({ title: "Visible", bodyMd: "a" }, null);
    const hid = await inMemoryRecommendationsPort.create({ title: "Hidden", bodyMd: "b" }, null);
    await inMemoryRecommendationsPort.archive(hid.id);

    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const listed = await svc.listRecommendations({});
    expect(listed.some((r) => r.id === hid.id)).toBe(false);
  });

  it("listRecommendations filters by domain", async () => {
    await inMemoryRecommendationsPort.create({ title: "N", bodyMd: "x", domain: "nutrition" }, null);
    await inMemoryRecommendationsPort.create({ title: "M", bodyMd: "y", domain: "motivation" }, null);

    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const onlyNutrition = await svc.listRecommendations({ domain: "nutrition" });
    expect(onlyNutrition).toHaveLength(1);
    expect(onlyNutrition[0]?.title).toBe("N");
  });

  it("getRecommendationUsage returns seeded snapshot", async () => {
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const rec = await svc.createRecommendation({ title: "R", bodyMd: "x" }, null);
    seedInMemoryRecommendationUsageSnapshot(rec.id, {
      ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT,
      publishedTreatmentProgramTemplateCount: 1,
    });
    const u = await svc.getRecommendationUsage(rec.id);
    expect(u.publishedTreatmentProgramTemplateCount).toBe(1);
  });

  it("archiveRecommendation blocks without acknowledgement when published templates reference item", async () => {
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const rec = await svc.createRecommendation({ title: "Guarded", bodyMd: "x" }, null);
    seedInMemoryRecommendationUsageSnapshot(rec.id, {
      ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT,
      publishedTreatmentProgramTemplateCount: 1,
      publishedTreatmentProgramTemplateRefs: [{ kind: "treatment_program_template", id: "tpl", title: "P" }],
    });
    await expect(svc.archiveRecommendation(rec.id)).rejects.toBeInstanceOf(
      RecommendationUsageConfirmationRequiredError,
    );
    await svc.archiveRecommendation(rec.id, { acknowledgeUsageWarning: true });
    expect((await svc.getRecommendation(rec.id))?.isArchived).toBe(true);
  });

  it("archiveRecommendation proceeds without acknowledgement when only draft templates reference item", async () => {
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const rec = await svc.createRecommendation({ title: "DraftOnly", bodyMd: "x" }, null);
    seedInMemoryRecommendationUsageSnapshot(rec.id, {
      ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT,
      draftTreatmentProgramTemplateCount: 1,
      draftTreatmentProgramTemplateRefs: [{ kind: "treatment_program_template", id: "d1", title: "Draft" }],
    });
    await svc.archiveRecommendation(rec.id);
    expect((await svc.getRecommendation(rec.id))?.isArchived).toBe(true);
  });

  it("archiveRecommendation blocks without acknowledgement when active instances reference item", async () => {
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const rec = await svc.createRecommendation({ title: "ActiveInst", bodyMd: "x" }, null);
    seedInMemoryRecommendationUsageSnapshot(rec.id, {
      ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT,
      activeTreatmentProgramInstanceCount: 1,
      activeTreatmentProgramInstanceRefs: [
        {
          kind: "treatment_program_instance",
          id: "inst-1",
          title: "Программа",
          patientUserId: "patient-1",
        },
      ],
    });
    await expect(svc.archiveRecommendation(rec.id)).rejects.toBeInstanceOf(
      RecommendationUsageConfirmationRequiredError,
    );
    await svc.archiveRecommendation(rec.id, { acknowledgeUsageWarning: true });
    expect((await svc.getRecommendation(rec.id))?.isArchived).toBe(true);
  });

  it("archiveRecommendation proceeds without acknowledgement when only completed instances reference item", async () => {
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const rec = await svc.createRecommendation({ title: "CompletedOnly", bodyMd: "x" }, null);
    seedInMemoryRecommendationUsageSnapshot(rec.id, {
      ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT,
      completedTreatmentProgramInstanceCount: 2,
      completedTreatmentProgramInstanceRefs: [
        {
          kind: "treatment_program_instance",
          id: "inst-done",
          title: "Было",
          patientUserId: "patient-2",
        },
      ],
    });
    await svc.archiveRecommendation(rec.id);
    expect((await svc.getRecommendation(rec.id))?.isArchived).toBe(true);
  });

  it("unarchiveRecommendation clears isArchived", async () => {
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const rec = await svc.createRecommendation({ title: "Back", bodyMd: "x" }, null);
    await svc.archiveRecommendation(rec.id);
    await svc.unarchiveRecommendation(rec.id);
    expect((await svc.getRecommendation(rec.id))?.isArchived).toBe(false);
  });

  it("unarchiveRecommendation throws when not archived", async () => {
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const rec = await svc.createRecommendation({ title: "Live", bodyMd: "x" }, null);
    await expect(svc.unarchiveRecommendation(rec.id)).rejects.toBeInstanceOf(RecommendationUnarchiveNotArchivedError);
  });

  it("updateRecommendation throws when archived", async () => {
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const rec = await svc.createRecommendation({ title: "NoEdit", bodyMd: "x" }, null);
    await svc.archiveRecommendation(rec.id);
    await expect(svc.updateRecommendation(rec.id, { title: "Nope" })).rejects.toThrow(/архиве/);
  });

  it("listRecommendations intersects domain and regionRefId (AND)", async () => {
    const regionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await inMemoryRecommendationsPort.create(
      { title: "Match", bodyMd: "x", domain: "nutrition", bodyRegionId: regionId },
      null,
    );
    await inMemoryRecommendationsPort.create(
      { title: "WrongRegion", bodyMd: "y", domain: "nutrition", bodyRegionId: null },
      null,
    );
    await inMemoryRecommendationsPort.create(
      { title: "WrongType", bodyMd: "z", domain: "motivation", bodyRegionId: regionId },
      null,
    );
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const out = await svc.listRecommendations({ domain: "nutrition", regionRefId: regionId });
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe("Match");
  });

  it("archive and unarchive retain B4 fields (region + metric texts)", async () => {
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const regionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const rec = await svc.createRecommendation(
      {
        title: "R",
        bodyMd: "md",
        domain: "regimen",
        bodyRegionId: regionId,
        quantityText: "  1 раз  ",
        frequencyText: "",
        durationText: null,
      },
      null,
    );
    expect(rec.quantityText).toBe("1 раз");
    await svc.archiveRecommendation(rec.id);
    let cur = await svc.getRecommendation(rec.id);
    expect(cur?.isArchived).toBe(true);
    expect(cur?.bodyRegionId).toBe(regionId);
    expect(cur?.quantityText).toBe("1 раз");
    await svc.unarchiveRecommendation(rec.id);
    cur = await svc.getRecommendation(rec.id);
    expect(cur?.isArchived).toBe(false);
    expect(cur?.bodyRegionId).toBe(regionId);
  });
});
