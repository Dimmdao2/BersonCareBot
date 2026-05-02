import { describe, expect, it, beforeEach } from "vitest";
import { createRecommendationsService } from "./service";
import { RecommendationUsageConfirmationRequiredError } from "./errors";
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
});
