/**
 * In-process smoke: библиотека блоков программ лечения + сервисный CRUD в памяти.
 * RSC-страницы doctor/* — в smoke-app-router-rsc-pages-inprocess.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  resetInMemoryClinicalTestsStore,
  resetInMemoryTestSetsStore,
  resetInMemoryRecommendationsStore,
} from "@/app-layer/testing/clinicalLibraryInMemory";

describe("treatment program block library (phase 2) doctor e2e (in-process)", () => {
  beforeEach(() => {
    resetInMemoryClinicalTestsStore();
    resetInMemoryTestSetsStore();
    resetInMemoryRecommendationsStore();
  });

  it("clinical test → archive → hidden from list (in-memory)", async () => {
    const { createClinicalTestsService } = await import("@/modules/tests/service");
    const { inMemoryClinicalTestsPort } = await import("@/app-layer/testing/clinicalLibraryInMemory");
    const { inMemoryReferencesPort } = await import("@/infra/repos/inMemoryReferences");
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort, inMemoryReferencesPort);
    const t = await svc.createClinicalTest({ title: "TP Block" }, "doc-1");
    const listed = await svc.listClinicalTests({});
    expect(listed.some((x) => x.id === t.id)).toBe(true);
    await svc.archiveClinicalTest(t.id);
    const after = await svc.listClinicalTests({});
    expect(after.some((x) => x.id === t.id)).toBe(false);
  });

  it("recommendation create → list excludes archived", async () => {
    const { createRecommendationsService } = await import("@/modules/recommendations/service");
    const { inMemoryRecommendationsPort } = await import("@/app-layer/testing/clinicalLibraryInMemory");
    const { inMemoryReferencesPort } = await import("@/infra/repos/inMemoryReferences");
    const svc = createRecommendationsService(inMemoryRecommendationsPort, inMemoryReferencesPort);
    const r = await svc.createRecommendation({ title: "R1", bodyMd: "x" }, null);
    await svc.archiveRecommendation(r.id);
    const listed = await svc.listRecommendations({});
    expect(listed.some((x) => x.id === r.id)).toBe(false);
  });
});
