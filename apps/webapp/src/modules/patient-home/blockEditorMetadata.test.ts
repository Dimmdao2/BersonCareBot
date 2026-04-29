import { describe, expect, it } from "vitest";
import { allowedTargetTypesForBlock, PATIENT_HOME_BLOCK_CODES } from "./blocks";
import { getPatientHomeBlockEditorMetadata } from "./blockEditorMetadata";
import type { PatientHomeBlockCode } from "./ports";

describe("getPatientHomeBlockEditorMetadata", () => {
  it("covers every code in PATIENT_HOME_BLOCK_CODES", () => {
    for (const code of PATIENT_HOME_BLOCK_CODES) {
      const meta = getPatientHomeBlockEditorMetadata(code);
      expect(meta.code).toBe(code);
    }
  });

  it("matches allowedTargetTypesForBlock for all codes", () => {
    for (const code of PATIENT_HOME_BLOCK_CODES) {
      const meta = getPatientHomeBlockEditorMetadata(code);
      expect(meta.allowedTargetTypes).toEqual(allowedTargetTypesForBlock(code));
    }
  });

  it("situations: only content_section, inline section create enabled", () => {
    const meta = getPatientHomeBlockEditorMetadata("situations");
    expect(meta.allowedTargetTypes).toEqual(["content_section"]);
    expect(meta.inlineCreate.contentSection).toBe(true);
    expect(meta.itemNoun).toBe("раздел");
    expect(meta.addLabel).toBe("Добавить раздел");
    expect(meta.displayTitle).toBe("Быстрые ситуации (разделы)");
  });

  it("daily_warmup: only content_page", () => {
    const meta = getPatientHomeBlockEditorMetadata("daily_warmup");
    expect(meta.allowedTargetTypes).toEqual(["content_page"]);
    expect(meta.itemNoun).toBe("материал");
    expect(meta.addLabel).toBe("Добавить материал");
  });

  it("subscription_carousel: content_section, content_page, course", () => {
    const meta = getPatientHomeBlockEditorMetadata("subscription_carousel");
    expect(meta.allowedTargetTypes).toEqual(["content_section", "content_page", "course"]);
    expect(meta.inlineCreate.contentSection).toBe(true);
  });

  it("non-CMS blocks have canManageItems false", () => {
    const nonCms: PatientHomeBlockCode[] = ["booking", "progress", "next_reminder", "mood_checkin", "plan"];
    for (const code of nonCms) {
      const meta = getPatientHomeBlockEditorMetadata(code);
      expect(meta.canManageItems, code).toBe(false);
      expect(meta.itemNoun, code).toBeNull();
      expect(meta.addLabel, code).toBeNull();
      expect(meta.inlineCreate.contentSection, code).toBe(false);
    }
  });

  it("CMS list blocks have canManageItems true", () => {
    const cms: PatientHomeBlockCode[] = [
      "daily_warmup",
      "situations",
      "subscription_carousel",
      "sos",
      "courses",
    ];
    for (const code of cms) {
      expect(getPatientHomeBlockEditorMetadata(code).canManageItems, code).toBe(true);
    }
  });

  it("exposes full allowedTargetTypeLabels map", () => {
    const meta = getPatientHomeBlockEditorMetadata("situations");
    expect(meta.allowedTargetTypeLabels).toMatchObject({
      content_section: "Раздел",
      content_page: "Материал",
      course: "Курс",
      static_action: "Действие",
    });
  });
});
