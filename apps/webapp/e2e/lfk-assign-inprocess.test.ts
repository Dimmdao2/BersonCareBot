/**
 * E2E (in-process): комплекс с origin «назначен врачом» в дневнике ЛФК + отметка занятия.
 * Полный assign через БД покрыт `pgLfkAssignments.test.ts`; здесь — проекция в дневнике пациента.
 */
import { describe, expect, it } from "vitest";
import { createLfkDiaryService } from "@/modules/diaries/lfk-service";
import { inMemoryLfkDiaryPort } from "@/infra/repos/lfkDiary";

describe("lfk assign → patient diary → session (in-process)", () => {
  it("assigned_by_specialist complex is listed and session can be recorded", async () => {
    const userId = `patient-assign-${crypto.randomUUID()}`;
    const svc = createLfkDiaryService(inMemoryLfkDiaryPort);
    const c = await svc.createComplex({
      userId,
      title: "Комплекс по шаблону",
      origin: "assigned_by_specialist",
    });
    const listed = await svc.listComplexes(userId);
    const found = listed.find((x) => x.id === c.id);
    expect(found?.origin).toBe("assigned_by_specialist");
    const session = await svc.addLfkSession({
      userId,
      complexId: c.id,
      source: "webapp",
    });
    expect(session.complexId).toBe(c.id);
    expect(session.source).toBe("webapp");
  });
});
