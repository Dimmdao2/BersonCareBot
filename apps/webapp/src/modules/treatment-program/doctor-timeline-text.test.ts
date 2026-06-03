import { describe, expect, it } from "vitest";
import {
  formatTreatmentProgramEventTypeRu,
  shouldOmitTreatmentProgramEventFromDoctorTimeline,
  summarizeTreatmentProgramEventForDoctorRu,
  formatProgramChangedEventDetailLinesForDoctorRu,
  parseProgramChangedDiffFromPayload,
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

  it("summarizes program_changed batch save", () => {
    const text = summarizeTreatmentProgramEventForDoctorRu(
      {
        id: "e5",
        instanceId: "inst",
        actorId: "doc",
        eventType: "program_changed",
        targetType: "program",
        targetId: "inst",
        payload: { scope: "editor_batch", diff: { stagesMetadataUpdated: 1 } },
        reason: null,
        createdAt: "2026-06-03T12:00:00.000Z",
      },
      labels,
    );
    expect(text).toBe("Программа изменена");
  });

  it("formats program_changed diff detail lines", () => {
    const lines = formatProgramChangedEventDetailLinesForDoctorRu({
      id: "e6",
      instanceId: "inst",
      actorId: "doc",
      eventType: "program_changed",
      targetType: "program",
      targetId: "inst",
      payload: {
        scope: "editor_batch",
        diff: { itemsAdded: 2, stagesReordered: true, stagesMetadataUpdated: 1 },
      },
      reason: null,
      createdAt: "2026-06-03T12:00:00.000Z",
    });
    expect(lines).toEqual([
      "Изменён порядок этапов",
      "Обновлено этапов: 1",
      "Добавлено элементов: 2",
    ]);
  });

  it("formatTreatmentProgramEventTypeRu capitalizes program_changed", () => {
    expect(formatTreatmentProgramEventTypeRu("program_changed")).toBe("Программа изменена");
  });

  it("parseProgramChangedDiffFromPayload rejects non-batch scope", () => {
    expect(parseProgramChangedDiffFromPayload({ scope: "other", diff: {} })).toBeNull();
    expect(parseProgramChangedDiffFromPayload(null)).toBeNull();
  });

  it("parseProgramChangedDiffFromPayload reads all diff counters", () => {
    const diff = parseProgramChangedDiffFromPayload({
      scope: "editor_batch",
      diff: {
        stagesAdded: 1,
        groupsAdded: 2,
        groupsHidden: 1,
        itemsRemoved: 3,
        itemsStructuralUpdated: 1,
        itemsMetadataUpdated: 4,
        itemsReordered: true,
        groupsReordered: true,
      },
    });
    expect(diff).toMatchObject({
      stagesAdded: 1,
      groupsAdded: 2,
      groupsHidden: 1,
      itemsRemoved: 3,
      itemsStructuralUpdated: 1,
      itemsMetadataUpdated: 4,
      itemsReordered: true,
      groupsReordered: true,
    });
    expect(
      formatProgramChangedEventDetailLinesForDoctorRu({
        id: "e7",
        instanceId: "inst",
        actorId: null,
        eventType: "program_changed",
        targetType: "program",
        targetId: "inst",
        payload: { scope: "editor_batch", diff: diff ?? {} },
        reason: null,
        createdAt: "2026-06-03T12:00:00.000Z",
      }),
    ).toEqual([
      "Добавлено этапов: 1",
      "Добавлено групп: 2",
      "Скрыто групп: 1",
      "Удалено элементов: 3",
      "Изменена структура элементов: 1",
      "Обновлены комментарии и нагрузка элементов: 4",
      "Изменён порядок элементов",
      "Изменён порядок групп",
    ]);
  });
});
