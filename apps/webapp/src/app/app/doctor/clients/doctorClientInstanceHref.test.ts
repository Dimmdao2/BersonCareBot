import { describe, expect, it } from "vitest";
import { doctorClientTreatmentProgramInstanceHref } from "./doctorClientInstanceHref";

describe("doctorClientTreatmentProgramInstanceHref", () => {
  it("includes focusItemId query param", () => {
    const href = doctorClientTreatmentProgramInstanceHref("user-1", "inst-1", {
      focusItemId: "result-abc",
      profileListScope: "all",
    });
    expect(href).toBe(
      "/app/doctor/clients/user-1/treatment-programs/inst-1?scope=all&focusItemId=result-abc",
    );
  });
});
