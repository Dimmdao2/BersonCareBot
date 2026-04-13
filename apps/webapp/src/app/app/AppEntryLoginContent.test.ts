import { describe, expect, it } from "vitest";
import { shouldShowRegistrationPlaque } from "./AppEntryLoginContent";

describe("shouldShowRegistrationPlaque", () => {
  it("shows before flow reports step and on phone step", () => {
    expect(shouldShowRegistrationPlaque(null)).toBe(true);
    expect(shouldShowRegistrationPlaque("phone")).toBe(true);
  });

  it("shows on oauth-first entry", () => {
    expect(shouldShowRegistrationPlaque("oauth_first")).toBe(true);
  });

  it("hides after user leaves phone step", () => {
    expect(shouldShowRegistrationPlaque("new_user_foreign")).toBe(false);
    expect(shouldShowRegistrationPlaque("choose_channel")).toBe(false);
    expect(shouldShowRegistrationPlaque("code")).toBe(false);
    expect(shouldShowRegistrationPlaque("foreign_no_otp_channel")).toBe(false);
  });
});
