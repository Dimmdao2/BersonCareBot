/**
 * E2E (in-process): diary modules and pages load; diaries wiring via buildAppDeps.
 * Does not start a server. Requires DATABASE_URL for add/list (or use in-memory when DATABASE_URL unset).
 */
import { describe, expect, it } from "vitest";

describe("diaries e2e (in-process)", () => {
  it("markLfkSession action is defined and callable", async () => {
    const { markLfkSession } = await import("@/app/app/patient/diary/lfk/actions");
    expect(typeof markLfkSession).toBe("function");
  });

  it("unified diary page default export is an async component", async () => {
    const mod = await import("@/app/app/patient/diary/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
  });

  it("legacy diary subroutes export redirect pages", async () => {
    const lfk = await import("@/app/app/patient/diary/lfk/page");
    const sym = await import("@/app/app/patient/diary/symptoms/page");
    expect(typeof lfk.default).toBe("function");
    expect(typeof sym.default).toBe("function");
  });

  it("QuickAddPopup client module loads", async () => {
    const mod = await import("@/app/app/patient/diary/QuickAddPopup");
    expect(typeof mod.QuickAddPopup).toBe("function");
  });

  it("buildAppDeps references returns seeded symptom types (in-memory)", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const items = await deps.references.listActiveItemsByCategoryCode("symptom_type");
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it("buildAppDeps exposes lfkAssignments", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    expect(deps.lfkAssignments).toBeDefined();
    expect(typeof deps.lfkAssignments.assignTemplateToPatient).toBe("function");
  });

  it("buildAppDeps diaries createLfkComplex + addLfkSession + listLfkSessions roundtrip", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const userId = "e2e-diaries-user";
    const complex = await deps.diaries.createLfkComplex({ userId, title: "E2E complex" });
    expect(complex.id).toBeDefined();
    const added = await deps.diaries.addLfkSession({
      userId,
      complexId: complex.id,
      source: "webapp",
      durationMinutes: 20,
      difficulty0_10: 3,
      pain0_10: 1,
      comment: "e2e",
    });
    expect(added.id).toBeDefined();
    expect(added.userId).toBe(userId);
    expect(added.complexId).toBe(complex.id);

    const list = await deps.diaries.listLfkSessions(userId);
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((s) => s.id === added.id)).toBe(true);
  });

  it("buildAppDeps diaries createTracking + addSymptomEntry + listSymptomEntries roundtrip", async () => {
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const userId = "e2e-diaries-user";
    const tracking = await deps.diaries.createSymptomTracking({
      userId,
      symptomTitle: "E2E test symptom",
    });
    expect(tracking.id).toBeDefined();
    expect(tracking.symptomTitle).toBe("E2E test symptom");

    const added = await deps.diaries.addSymptomEntry({
      userId,
      trackingId: tracking.id,
      value0_10: 5,
      entryType: "instant",
      recordedAt: new Date().toISOString(),
      source: "webapp",
    });
    expect(added.id).toBeDefined();
    expect(added.trackingId).toBe(tracking.id);
    expect(added.value0_10).toBe(5);

    const list = await deps.diaries.listSymptomEntries(userId);
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((e) => e.id === added.id)).toBe(true);
  });
});
