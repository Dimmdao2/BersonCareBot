import { describe, expect, it } from "vitest";
import {
  lfkComplexTemplateIdFromItemSettings,
  mergeLfkComplexTemplateIdIntoSettings,
  TREATMENT_PROGRAM_LFK_COMPLEX_TEMPLATE_ID_SETTINGS_KEY,
} from "./lfkComplexTemplateSettings";

describe("lfkComplexTemplateSettings", () => {
  it("reads and merges lfkComplexTemplateId", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(lfkComplexTemplateIdFromItemSettings(null)).toBeNull();
    expect(
      lfkComplexTemplateIdFromItemSettings({
        [TREATMENT_PROGRAM_LFK_COMPLEX_TEMPLATE_ID_SETTINGS_KEY]: id,
      }),
    ).toBe(id);
    expect(mergeLfkComplexTemplateIdIntoSettings({ foo: 1 }, id)).toEqual({
      foo: 1,
      [TREATMENT_PROGRAM_LFK_COMPLEX_TEMPLATE_ID_SETTINGS_KEY]: id,
    });
  });
});
