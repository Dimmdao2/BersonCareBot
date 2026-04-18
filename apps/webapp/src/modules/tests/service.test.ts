import { describe, expect, it, beforeEach } from "vitest";
import {
  createClinicalTestsService,
  createTestSetsService,
} from "./service";
import {
  inMemoryClinicalTestsPort,
  resetInMemoryClinicalTestsStore,
  inMemoryTestSetsPort,
  resetInMemoryTestSetsStore,
} from "@/app-layer/testing/clinicalLibraryInMemory";

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
});
