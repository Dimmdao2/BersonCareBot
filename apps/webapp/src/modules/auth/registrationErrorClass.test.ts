import { describe, expect, it } from "vitest";
import { classifyRegistrationErrorCode } from "./registrationErrorClass";

describe("classifyRegistrationErrorCode", () => {
  it("classifies user-facing codes", () => {
    expect(classifyRegistrationErrorCode("duplicate_email")).toBe("user");
    expect(classifyRegistrationErrorCode("invalid_code")).toBe("user");
    expect(classifyRegistrationErrorCode("access_denied")).toBe("user");
  });

  it("classifies system codes", () => {
    expect(classifyRegistrationErrorCode("db_error")).toBe("system");
    expect(classifyRegistrationErrorCode("send_failed")).toBe("system");
  });

  it("defaults unknown codes to system", () => {
    expect(classifyRegistrationErrorCode("mystery")).toBe("system");
  });
});
