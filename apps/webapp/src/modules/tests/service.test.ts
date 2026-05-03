import { describe, expect, it, beforeEach } from "vitest";
import { ClinicalTestUsageConfirmationRequiredError, TestSetUsageConfirmationRequiredError } from "./errors";
import {
  createClinicalTestsService,
  createTestSetsService,
} from "./service";
import {
  inMemoryClinicalTestsPort,
  resetInMemoryClinicalTestsStore,
  seedInMemoryClinicalTestUsageSnapshot,
  seedInMemoryTestSetUsageSnapshot,
  inMemoryTestSetsPort,
  resetInMemoryTestSetsStore,
} from "@/app-layer/testing/clinicalLibraryInMemory";
import { inMemoryReferencesPort } from "@/infra/repos/inMemoryReferences";
import { EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT, EMPTY_TEST_SET_USAGE_SNAPSHOT } from "./types";

describe("clinical tests / test sets service", () => {
  beforeEach(() => {
    resetInMemoryClinicalTestsStore();
    resetInMemoryTestSetsStore();
  });

  it("createClinicalTest rejects empty title", async () => {
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    await expect(svc.createClinicalTest({ title: "  " }, null)).rejects.toThrow(/обязательно/);
  });

  it("createClinicalTest rejects unknown assessmentKind", async () => {
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    await expect(
      svc.createClinicalTest({ title: "X", assessmentKind: "not_in_catalog" }, null),
    ).rejects.toThrow(/вид оценки/);
  });

  it("createClinicalTest accepts assessmentKind from reference catalog", async () => {
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    const t = await svc.createClinicalTest({ title: "Mob", assessmentKind: "mobility" }, null);
    expect(t.assessmentKind).toBe("mobility");
  });

  it("updateClinicalTest allows unchanged legacy assessmentKind with other field updates", async () => {
    const row = await inMemoryClinicalTestsPort.create({ title: "Leg", assessmentKind: "legacy_x" }, null);
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    const updated = await svc.updateClinicalTest(row.id, { title: "Renamed", assessmentKind: "legacy_x" });
    expect(updated.title).toBe("Renamed");
    expect(updated.assessmentKind).toBe("legacy_x");
  });

  it("updateClinicalTest rejects changing assessmentKind to unknown code", async () => {
    const row = await inMemoryClinicalTestsPort.create({ title: "L", assessmentKind: "legacy_x" }, null);
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    await expect(svc.updateClinicalTest(row.id, { assessmentKind: "nope" })).rejects.toThrow(/вид оценки/);
  });

  it("updateClinicalTest allows changing from legacy to catalog code", async () => {
    const row = await inMemoryClinicalTestsPort.create({ title: "L", assessmentKind: "legacy_x" }, null);
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    const updated = await svc.updateClinicalTest(row.id, { assessmentKind: "mobility" });
    expect(updated.assessmentKind).toBe("mobility");
  });

  it("listClinicalTests hides archived by default", async () => {
    await inMemoryClinicalTestsPort.create({ title: "Keep" }, null);
    const hidden = await inMemoryClinicalTestsPort.create({ title: "Gone" }, null);
    await inMemoryClinicalTestsPort.archive(hidden.id);

    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    const listed = await svc.listClinicalTests({});
    expect(listed.some((t) => t.id === hidden.id)).toBe(false);
    const withArchived = await svc.listClinicalTests({ archiveScope: "all" });
    expect(withArchived.some((t) => t.id === hidden.id)).toBe(true);
  });

  it("setTestSetItems rejects archived test ids", async () => {
    const clinical = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
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

  it("setTestSetItems persists comments on items", async () => {
    const t = await inMemoryClinicalTestsPort.create({ title: "Commented" }, null);
    const setsSvc = createTestSetsService(inMemoryTestSetsPort, inMemoryClinicalTestsPort);
    const set = await setsSvc.createTestSet({ title: "S" }, null);
    await setsSvc.setTestSetItems(set.id, [{ testId: t.id, sortOrder: 0, comment: "  note  " }]);
    const again = await setsSvc.getTestSet(set.id);
    expect(again?.items[0]?.comment).toBe("note");
  });

  it("setTestSetItems rejects duplicate test ids", async () => {
    const t = await inMemoryClinicalTestsPort.create({ title: "DupTest" }, null);
    const setsSvc = createTestSetsService(inMemoryTestSetsPort, inMemoryClinicalTestsPort);
    const set = await setsSvc.createTestSet({ title: "DupSet" }, null);
    await expect(
      setsSvc.setTestSetItems(set.id, [
        { testId: t.id, sortOrder: 0 },
        { testId: t.id, sortOrder: 1 },
      ]),
    ).rejects.toThrow(/дважды/);
  });

  it("unarchiveClinicalTest clears isArchived", async () => {
    const t = await inMemoryClinicalTestsPort.create({ title: "U" }, null);
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    await svc.archiveClinicalTest(t.id);
    await svc.unarchiveClinicalTest(t.id);
    expect((await svc.getClinicalTest(t.id))?.isArchived).toBe(false);
  });

  it("unarchiveClinicalTest throws when not archived", async () => {
    const t = await inMemoryClinicalTestsPort.create({ title: "N" }, null);
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    await expect(svc.unarchiveClinicalTest(t.id)).rejects.toMatchObject({ name: "ClinicalTestUnarchiveNotArchivedError" });
  });

  it("updateClinicalTest rejects when archived", async () => {
    const t = await inMemoryClinicalTestsPort.create({ title: "A" }, null);
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    await svc.archiveClinicalTest(t.id);
    await expect(svc.updateClinicalTest(t.id, { title: "B" })).rejects.toThrow(/архиве/);
  });

  it("unarchiveTestSet clears isArchived", async () => {
    const setsSvc = createTestSetsService(inMemoryTestSetsPort, inMemoryClinicalTestsPort);
    const set = await setsSvc.createTestSet({ title: "S" }, null);
    await setsSvc.archiveTestSet(set.id);
    await setsSvc.unarchiveTestSet(set.id);
    expect((await setsSvc.getTestSet(set.id))?.isArchived).toBe(false);
  });

  it("unarchiveTestSet throws when not archived", async () => {
    const setsSvc = createTestSetsService(inMemoryTestSetsPort, inMemoryClinicalTestsPort);
    const set = await setsSvc.createTestSet({ title: "S2" }, null);
    await expect(setsSvc.unarchiveTestSet(set.id)).rejects.toMatchObject({ name: "TestSetUnarchiveNotArchivedError" });
  });

  it("setTestSetItems rejects when set is archived", async () => {
    const clinical = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    const t = await clinical.createClinicalTest({ title: "T" }, null);
    const setsSvc = createTestSetsService(inMemoryTestSetsPort, inMemoryClinicalTestsPort);
    const set = await setsSvc.createTestSet({ title: "Arch" }, null);
    await setsSvc.setTestSetItems(set.id, [{ testId: t.id, sortOrder: 0 }]);
    await setsSvc.archiveTestSet(set.id);
    await expect(setsSvc.setTestSetItems(set.id, [{ testId: t.id, sortOrder: 0 }])).rejects.toThrow(/архиве/);
  });

  it("getClinicalTestUsage returns seeded snapshot", async () => {
    const t = await inMemoryClinicalTestsPort.create({ title: "U" }, null);
    seedInMemoryClinicalTestUsageSnapshot(t.id, {
      ...EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT,
      publishedTreatmentProgramTemplateCount: 2,
    });
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
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
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
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
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
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
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    await svc.archiveClinicalTest(t.id);
    expect((await svc.getClinicalTest(t.id))?.isArchived).toBe(true);
  });

  it("getTestSetUsage returns seeded snapshot", async () => {
    const setsSvc = createTestSetsService(inMemoryTestSetsPort, inMemoryClinicalTestsPort);
    const set = await setsSvc.createTestSet({ title: "S" }, null);
    seedInMemoryTestSetUsageSnapshot(set.id, {
      ...EMPTY_TEST_SET_USAGE_SNAPSHOT,
      publishedTreatmentProgramTemplateCount: 1,
    });
    const u = await setsSvc.getTestSetUsage(set.id);
    expect(u.publishedTreatmentProgramTemplateCount).toBe(1);
  });

  it("archiveTestSet blocks without acknowledgement when published templates reference set", async () => {
    const setsSvc = createTestSetsService(inMemoryTestSetsPort, inMemoryClinicalTestsPort);
    const set = await setsSvc.createTestSet({ title: "GuardedSet" }, null);
    seedInMemoryTestSetUsageSnapshot(set.id, {
      ...EMPTY_TEST_SET_USAGE_SNAPSHOT,
      publishedTreatmentProgramTemplateCount: 1,
      publishedTreatmentProgramTemplateRefs: [{ kind: "treatment_program_template", id: "tpl", title: "P" }],
    });
    await expect(setsSvc.archiveTestSet(set.id)).rejects.toBeInstanceOf(TestSetUsageConfirmationRequiredError);
    await setsSvc.archiveTestSet(set.id, { acknowledgeUsageWarning: true });
    expect((await setsSvc.getTestSet(set.id))?.isArchived).toBe(true);
  });

  it("archiveTestSet proceeds without acknowledgement when only draft templates reference set", async () => {
    const setsSvc = createTestSetsService(inMemoryTestSetsPort, inMemoryClinicalTestsPort);
    const set = await setsSvc.createTestSet({ title: "DraftTplOnly" }, null);
    seedInMemoryTestSetUsageSnapshot(set.id, {
      ...EMPTY_TEST_SET_USAGE_SNAPSHOT,
      draftTreatmentProgramTemplateCount: 1,
      draftTreatmentProgramTemplateRefs: [{ kind: "treatment_program_template", id: "d1", title: "Draft" }],
    });
    await setsSvc.archiveTestSet(set.id);
    expect((await setsSvc.getTestSet(set.id))?.isArchived).toBe(true);
  });

  it("archiveTestSet proceeds when only attempts history", async () => {
    const setsSvc = createTestSetsService(inMemoryTestSetsPort, inMemoryClinicalTestsPort);
    const set = await setsSvc.createTestSet({ title: "AttemptsOnly" }, null);
    seedInMemoryTestSetUsageSnapshot(set.id, {
      ...EMPTY_TEST_SET_USAGE_SNAPSHOT,
      testAttemptsRecordedCount: 10,
    });
    await setsSvc.archiveTestSet(set.id);
    expect((await setsSvc.getTestSet(set.id))?.isArchived).toBe(true);
  });
});
