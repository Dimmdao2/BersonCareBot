import { describe, expect, it } from "vitest";
import { shouldShowRegistrationPlaque } from "./AppEntryLoginContent";

describe("shouldShowRegistrationPlaque", () => {
  it("shows before flow reports step and on phone step", () => {
    expect(shouldShowRegistrationPlaque(null)).toBe(true);
    expect(shouldShowRegistrationPlaque("phone")).toBe(true);
  });

  it("hides after user leaves phone step", () => {
    expect(shouldShowRegistrationPlaque("pin")).toBe(false);
    expect(shouldShowRegistrationPlaque("new_user_sms")).toBe(false);
    expect(shouldShowRegistrationPlaque("choose_channel")).toBe(false);
    expect(shouldShowRegistrationPlaque("code")).toBe(false);
    expect(shouldShowRegistrationPlaque("set_pin")).toBe(false);
  });
});
