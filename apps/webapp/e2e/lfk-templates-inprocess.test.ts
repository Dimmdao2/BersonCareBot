import { describe, expect, it, beforeEach } from "vitest";
import { resetInMemoryLfkTemplatesStore } from "@/infra/repos/inMemoryLfkTemplates";

describe("lfk templates doctor e2e (in-process)", () => {
  beforeEach(() => {
    resetInMemoryLfkTemplatesStore();
  });

  it("doctor lfk-templates list page is async server component", async () => {
    const mod = await import("@/app/app/doctor/lfk-templates/page");
    expect(typeof mod.default).toBe("function");
    expect(mod.default.constructor.name).toBe("AsyncFunction");
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
