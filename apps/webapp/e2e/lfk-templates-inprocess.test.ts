import { describe, expect, it, beforeEach } from "vitest";
import { resetInMemoryLfkTemplatesStore } from "@/infra/repos/inMemoryLfkTemplates";

/**
 * RSC list page — в smoke-app-router-rsc-pages-inprocess.
 */
describe("lfk templates doctor e2e (in-process)", () => {
  beforeEach(() => {
    resetInMemoryLfkTemplatesStore();
  });

  it("create template → add exercises → publish", async () => {
    const { createLfkTemplatesService } = await import("@/modules/lfk-templates/service");
    const { inMemoryLfkTemplatesPort } = await import("@/infra/repos/inMemoryLfkTemplates");
    const svc = createLfkTemplatesService(inMemoryLfkTemplatesPort);
    const t = await svc.createTemplate({ title: "Утренний комплекс" }, "doc-1");
    await svc.updateExercises(t.id, [{ exerciseId: "ex-a", sortOrder: 0 }]);
    const published = await svc.publishTemplate(t.id);
    expect(published.status).toBe("published");
  });
});
