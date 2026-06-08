import { describe, expect, it } from "vitest";
import { createEmptyInstanceEditorDraft } from "./instanceEditorDraft";
import {
  INSTANCE_EDITOR_LOAD_REPS_RANGE,
  formatInstanceEditorSaveError,
  isStaleInstanceEditorSaveError,
  parseInstanceEditorLoadField,
  validateInstanceEditorDraftLoadSettings,
  validateInstanceEditorLoadSettingsPatch,
} from "./instanceEditorLoadSettings";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";

function minimalDetail(): TreatmentProgramInstanceDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    title: "План",
    status: "active",
    assignmentSource: "doctor",
    assignedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    patientPlanLastOpenedAt: null,
    stages: [],
  };
}

describe("instanceEditorLoadSettings", () => {
  it("parseInstanceEditorLoadField rejects out-of-range reps", () => {
    expect(() =>
      parseInstanceEditorLoadField("0", "Повторы", INSTANCE_EDITOR_LOAD_REPS_RANGE),
    ).toThrow("Повторы: целое число от 1 до 999");
  });

  it("validateInstanceEditorLoadSettingsPatch accepts null fields", () => {
    expect(validateInstanceEditorLoadSettingsPatch({ reps: null, sets: null, maxPain: null })).toBeNull();
  });

  it("validateInstanceEditorDraftLoadSettings scans itemCreates", () => {
    const baseline = minimalDetail();
    const draft = {
      ...createEmptyInstanceEditorDraft(),
      itemCreates: [
        {
          kind: "library_item" as const,
          clientId: "draft:11111111-1111-4111-8111-111111111111",
          stageId: "22222222-2222-4222-8222-222222222222",
          itemType: "exercise" as const,
          itemRefId: "55555555-5555-4555-8555-555555555555",
          snapshot: { title: "Упр" },
          loadSettings: { reps: 0, sets: null, maxPain: null },
        },
      ],
    };
    expect(validateInstanceEditorDraftLoadSettings(draft, baseline)).toBe(
      "Повторы: целое число от 1 до 999",
    );
  });

  it("isStaleInstanceEditorSaveError distinguishes catalog and validation errors", () => {
    expect(isStaleInstanceEditorSaveError("Элемент не найден")).toBe(true);
    expect(isStaleInstanceEditorSaveError("Программа не найдена")).toBe(true);
    expect(isStaleInstanceEditorSaveError("Объект для типа «exercise» не найден или недоступен")).toBe(
      false,
    );
    expect(isStaleInstanceEditorSaveError("Некорректный порядок: элементов этапа")).toBe(false);
    expect(isStaleInstanceEditorSaveError("Повторы: целое число от 1 до 999")).toBe(false);
  });

  it("formatInstanceEditorSaveError appends refresh hint", () => {
    expect(formatInstanceEditorSaveError("Элемент не найден", true)).toContain("Программа обновлена");
    expect(formatInstanceEditorSaveError("Некорректный порядок", true)).toBe("Некорректный порядок");
  });
});
