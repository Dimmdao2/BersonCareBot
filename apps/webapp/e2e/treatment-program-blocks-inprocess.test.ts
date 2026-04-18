/**
 * In-process smoke: страницы библиотеки блоков программ лечения + сервисный CRUD в памяти.
 * См. `e2e/lfk-exercises-inprocess.test.ts`, AUDIT_PHASE_2 FIX #4.
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

  it("doctor clinical-tests page is async server component", async () => {
    const mod = await import("@/app/app/doctor/clinical-tests/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("doctor test-sets page is async server component", async () => {
    const mod = await import("@/app/app/doctor/test-sets/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("doctor recommendations page is async server component", async () => {
    const mod = await import("@/app/app/doctor/recommendations/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("clinical test → archive → hidden from list (in-memory)", async () => {
    const { createClinicalTestsService } = await import("@/modules/tests/service");
    const { inMemoryClinicalTestsPort } = await import("@/app-layer/testing/clinicalLibraryInMemory");
    const svc = createClinicalTestsService(inMemoryClinicalTestsPort);
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
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const r = await svc.createRecommendation({ title: "R1", bodyMd: "x" }, null);
    await svc.archiveRecommendation(r.id);
    const listed = await svc.listRecommendations({});
    expect(listed.some((x) => x.id === r.id)).toBe(false);
  });
});
