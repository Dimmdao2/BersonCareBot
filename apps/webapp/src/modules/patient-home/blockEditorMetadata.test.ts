import { describe, expect, it } from "vitest";
import {
  getPatientHomeAddItemDialogTitle,
  getPatientHomeBlockDisplayTitle,
  getPatientHomeBlockEditorMetadata,
} from "@/modules/patient-home/blockEditorMetadata";
import { PATIENT_HOME_CMS_BLOCK_CODES } from "@/modules/patient-home/blocks";

describe("getPatientHomeBlockEditorMetadata", () => {
  it("covers all CMS block codes", () => {
    for (const code of PATIENT_HOME_CMS_BLOCK_CODES) {
      const m = getPatientHomeBlockEditorMetadata(code);
      expect(m.itemNoun.length).toBeGreaterThan(0);
      expect(m.addLabel.length).toBeGreaterThan(0);
      expect(m.emptyPreviewText.length).toBeGreaterThan(0);
      expect(m.emptyRuntimeText.length).toBeGreaterThan(0);
      expect(m.allowedTargetTypeLabels.content_section).toBe("Раздел");
      expect(m.allowedTargetTypeLabels.content_page).toBe("Материал");
      expect(m.allowedTargetTypeLabels.course).toBe("Курс");
    }
  });

  it("uses «Добавить раздел» for situations", () => {
    expect(getPatientHomeBlockEditorMetadata("situations").addLabel).toBe("Добавить раздел");
  });

  it("uses «Добавить материал» for daily_warmup", () => {
    expect(getPatientHomeBlockEditorMetadata("daily_warmup").addLabel).toBe("Добавить материал");
  });

  it("uses mixed add label for subscription_carousel", () => {
    expect(getPatientHomeBlockEditorMetadata("subscription_carousel").addLabel).toBe("Добавить раздел / материал / курс");
  });

  it("uses «Добавить курс» for courses", () => {
    expect(getPatientHomeBlockEditorMetadata("courses").addLabel).toBe("Добавить курс");
  });

  it("uses section-or-material label for sos", () => {
    expect(getPatientHomeBlockEditorMetadata("sos").addLabel).toBe("Добавить раздел или материал");
  });

  it("marks system blocks without add label", () => {
    expect(getPatientHomeBlockEditorMetadata("lfk_progress").addLabel).toBe("");
    expect(getPatientHomeBlockEditorMetadata("lfk_progress").emptyPreviewText).toMatch(
      /не настраивается списком/i,
    );
  });
});

describe("getPatientHomeAddItemDialogTitle", () => {
  it("uses item noun in title for CMS blocks", () => {
    expect(getPatientHomeAddItemDialogTitle("situations")).toBe("Выберите раздел для блока");
    expect(getPatientHomeAddItemDialogTitle("courses")).toBe("Выберите курс для блока");
  });

  it("uses generic title for system blocks", () => {
    expect(getPatientHomeAddItemDialogTitle("lfk_progress")).toBe("Элементы не настраиваются");
  });
});

describe("getPatientHomeBlockDisplayTitle", () => {
  it("returns Russian titles", () => {
    expect(getPatientHomeBlockDisplayTitle("situations")).toMatch(/ситуации/i);
    expect(getPatientHomeBlockDisplayTitle("courses")).toBe("Курсы");
  });
});
