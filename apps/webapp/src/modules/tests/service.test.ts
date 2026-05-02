import { describe, expect, it, beforeEach } from "vitest";
import { ClinicalTestUsageConfirmationRequiredError } from "./errors";
import {
  createClinicalTestsService,
  createTestSetsService,
} from "./service";
import {
  inMemoryClinicalTestsPort,
  resetInMemoryClinicalTestsStore,
  seedInMemoryClinicalTestUsageSnapshot,
  inMemoryTestSetsPort,
  resetInMemoryTestSetsStore,
} from "@/app-layer/testing/clinicalLibraryInMemory";
import { EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT } from "./types";

describe("clinical tests / test sets service", () => {
  beforeEach(() => {
    resetInMemoryClinicalTestsStore();
    resetInMemoryTestSetsStore();
  });

  it("createClinicalTest rejects empty title", async () => {
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort);
    await expect(svc.createClinicalTest({ title: "  " }, null)).rejects.toThrow(/обязательно/);
  });

  it("listClinicalTests hides archived by default", async () => {
    await inMemoryClinicalTestsPort.create({ title: "Keep" }, null);
    const hidden = await inMemoryClinicalTestsPort.create({ title: "Gone" }, null);
    await inMemoryClinicalTestsPort.archive(hidden.id);

    const svc = createClinicalTestsService(inMemoryClinicalTestsPort);
    const listed = await svc.listClinicalTests({});
    expect(listed.some((t) => t.id === hidden.id)).toBe(false);
    const withArchived = await svc.listClinicalTests({ includeArchived: true });
    expect(withArchived.some((t) => t.id === hidden.id)).toBe(true);
  });

  it("setTestSetItems rejects archived test ids", async () => {
    const clinical = createClinicalTestsService(inMemoryClinicalTestsPort);
    const archived = await clinical.createClinicalTest({ title: "Old" }, null);
    await clinical.archiveClinicalTest(archived.id);

    const setsSvc = createTestSetsService(inMemoryTestSetsPort, inMemoryClinicalTestsPort);
    const set = await setsSvc.createTestSet({ title: "S1" }, null);

    await expect(
      setsSvc.setTestSetItems(set.id, [{ testId: archived.id, sortOrder: 0 }]),
    ).rejects.toThrow(/архивирован/);
  });

  it("setTestSetItems persists ordered items", async () => {
    const t1 = await inMemoryClinicalTestsPort.create({ title: "A" }, null);
    const t2 = await inMemoryClinicalTestsPort.create({ title: "B" }, null);

    const setsSvc = createTestSetsService(inMemoryTestSetsPort, inMemoryClinicalTestsPort);
    const set = await setsSvc.createTestSet({ title: "Battery" }, null);

    await setsSvc.setTestSetItems(set.id, [
      { testId: t2.id, sortOrder: 0 },
      { testId: t1.id, sortOrder: 1 },
    ]);

    const again = await setsSvc.getTestSet(set.id);
    expect(again?.items.map((i) => i.testId)).toEqual([t2.id, t1.id]);
  });

  it("getClinicalTestUsage returns seeded snapshot", async () => {
    const t = await inMemoryClinicalTestsPort.create({ title: "U" }, null);
    seedInMemoryClinicalTestUsageSnapshot(t.id, {
      ...EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT,
      publishedTreatmentProgramTemplateCount: 2,
    });
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort);
    const u = await svc.getClinicalTestUsage(t.id);
    expect(u.publishedTreatmentProgramTemplateCount).toBe(2);
  });

  it("archiveClinicalTest blocks without acknowledgement when usage requires it", async () => {
    const t = await inMemoryClinicalTestsPort.create({ title: "Guarded" }, null);
    seedInMemoryClinicalTestUsageSnapshot(t.id, {
      ...EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT,
      nonArchivedTestSetsContainingCount: 1,
      nonArchivedTestSetRefs: [{ kind: "test_set", id: "set-1", title: "Набор" }],
    });
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort);
    await expect(svc.archiveClinicalTest(t.id)).rejects.toBeInstanceOf(ClinicalTestUsageConfirmationRequiredError);
    await svc.archiveClinicalTest(t.id, { acknowledgeUsageWarning: true });
    const row = await svc.getClinicalTest(t.id);
    expect(row?.isArchived).toBe(true);
  });

  it("archiveClinicalTest proceeds without dialog when only archived program templates in usage", async () => {
    const t = await inMemoryClinicalTestsPort.create({ title: "ArchivedTplOnly" }, null);
    seedInMemoryClinicalTestUsageSnapshot(t.id, {
      ...EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT,
      archivedTreatmentProgramTemplateCount: 2,
      archivedTreatmentProgramTemplateRefs: [
        { kind: "treatment_program_template", id: "tpl-1", title: "Old" },
      ],
    });
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort);
    await svc.archiveClinicalTest(t.id);
    expect((await svc.getClinicalTest(t.id))?.isArchived).toBe(true);
  });

  it("archiveClinicalTest proceeds without dialog when only historical usage", async () => {
    const t = await inMemoryClinicalTestsPort.create({ title: "Hist" }, null);
    seedInMemoryClinicalTestUsageSnapshot(t.id, {
      ...EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT,
      archivedTestSetsContainingCount: 1,
      draftTreatmentProgramTemplateCount: 1,
      completedTreatmentProgramInstanceCount: 1,
      testResultsRecordedCount: 5,
    });
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort);
    await svc.archiveClinicalTest(t.id);
    expect((await svc.getClinicalTest(t.id))?.isArchived).toBe(true);
  });
});
