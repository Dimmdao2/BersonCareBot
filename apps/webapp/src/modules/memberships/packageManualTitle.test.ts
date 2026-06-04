import { describe, expect, it } from "vitest";
import { buildManualPatientPackageTitle } from "./packageManualTitle";

describe("buildManualPatientPackageTitle", () => {
  it("formats singular position", () => {
    expect(
      buildManualPatientPackageTitle({
        itemCount: 1,
        soldAtIso: "2026-06-04T12:00:00Z",
      }),
    ).toBe("Индивидуальный · 1 позиция · 04.06.2026");
  });

  it("formats plural positions", () => {
    expect(
      buildManualPatientPackageTitle({
        itemCount: 3,
        soldAtIso: "2026-06-04T12:00:00Z",
      }),
    ).toBe("Индивидуальный · 3 позиции · 04.06.2026");
  });
});
