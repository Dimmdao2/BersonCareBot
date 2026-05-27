import { describe, expect, it } from "vitest";
import { patientGreetingPersonalizedName } from "./patientGreetingPersonalizedName";

describe("patientGreetingPersonalizedName", () => {
  it("prefers firstName over displayName", () => {
    expect(
      patientGreetingPersonalizedName({
        firstName: "Дмитрий",
        displayName: "Дмитрий Берсон",
      }),
    ).toBe("Дмитрий");
  });

  it("falls back to displayName when firstName is empty", () => {
    expect(
      patientGreetingPersonalizedName({
        firstName: "  ",
        displayName: "Дмитрий Берсон",
      }),
    ).toBe("Дмитрий Берсон");
  });

  it("returns null when both are empty", () => {
    expect(
      patientGreetingPersonalizedName({
        firstName: undefined,
        displayName: "",
      }),
    ).toBeNull();
  });
});
