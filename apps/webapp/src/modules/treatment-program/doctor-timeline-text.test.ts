import { describe, expect, it } from "vitest";
import {
  shouldOmitTreatmentProgramEventFromDoctorTimeline,
  summarizeTreatmentProgramEventForDoctorRu,
} from "./types";

const labels = {
  itemTitle: (id: string) =>
    ({ i1: "Комплекс утро", i2: "Тест колено" } as Record<string, string>)[id],
  stageTitle: (id: string) => ({ s1: "Подготовка" } as Record<string, string>)[id],
};

describe("doctor treatment program timeline copy", () => {
  it("omits patient checklist completion mirrored as status_changed/completedAt", () => {
    expect(
      shouldOmitTreatmentProgramEventFromDoctorTimeline({
        id: "e1",
        instanceId: "inst",
        actorId: "patient",
        eventType: "status_changed",
        targetType: "stage_item",
        targetId: "i1",
        payload: { scope: "stage_item", field: "completedAt", value: "2026-05-05T18:49:00.000Z", stageId: "s1" },
        reason: null,
        createdAt: "2026-05-05T18:49:00.000Z",
      }),
    ).toBe(true);
  });

  it("keeps doctor recommendation actionable toggle", () => {
    expect(
      shouldOmitTreatmentProgramEventFromDoctorTimeline({
        id: "e2",
        instanceId: "inst",
        actorId: "doc",
        eventType: "status_changed",
        targetType: "stage_item",
        targetId: "i1",
        payload: { scope: "stage_item", field: "isActionable", value: false, stageId: "s1" },
        reason: null,
        createdAt: "2026-05-05T18:50:00.000Z",
      }),
    ).toBe(false);
  });

  it("summarizes stage lifecycle without generic «изменён статус»", () => {
    const text = summarizeTreatmentProgramEventForDoctorRu(
      {
        id: "e3",
        instanceId: "inst",
        actorId: null,
        eventType: "status_changed",
        targetType: "stage",
        targetId: "s1",
        payload: { scope: "stage", from: "available", to: "in_progress" },
        reason: null,
        createdAt: "2026-05-05T18:51:00.000Z",
      },
      labels,
    );
    expect(text).toContain("Подготовка");
    expect(text).toContain("доступен");
    expect(text).toContain("в процессе");
    expect(text).not.toMatch(/изменён статус/i);
  });

  it("summarizes test submission with human decision label", () => {
    const text = summarizeTreatmentProgramEventForDoctorRu(
      {
        id: "e4",
        instanceId: "inst",
        actorId: "patient",
        eventType: "test_completed",
        targetType: "stage_item",
        targetId: "i2",
        payload: { normalizedDecision: "passed", testId: "t1" },
        reason: null,
        createdAt: "2026-05-05T18:52:00.000Z",
      },
      labels,
    );
    expect(text).toContain("Тест колено");
    expect(text).toContain("зачтено");
  });
});
