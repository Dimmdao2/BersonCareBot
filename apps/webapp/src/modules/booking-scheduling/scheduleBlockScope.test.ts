import { describe, expect, it } from "vitest";
import { scheduleBlockAppliesToScope } from "./scheduleBlockScope";

describe("scheduleBlockAppliesToScope", () => {
  it("org-wide block applies to any specialist query", () => {
    expect(
      scheduleBlockAppliesToScope({
        blockSpecialistId: null,
        specialistId: "sp-1",
      }),
    ).toBe(true);
  });

  it("specialist-scoped block applies only to matching specialist", () => {
    expect(
      scheduleBlockAppliesToScope({
        blockSpecialistId: "sp-1",
        specialistId: "sp-1",
      }),
    ).toBe(true);
    expect(
      scheduleBlockAppliesToScope({
        blockSpecialistId: "sp-1",
        specialistId: "sp-2",
      }),
    ).toBe(false);
  });
});
