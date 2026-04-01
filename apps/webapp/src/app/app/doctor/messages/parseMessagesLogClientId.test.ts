import { describe, expect, it } from "vitest";
import { parseMessagesLogClientId } from "./parseMessagesLogClientId";

describe("parseMessagesLogClientId", () => {
  it("returns empty when reset", () => {
    expect(parseMessagesLogClientId("any", true)).toEqual({ clientId: "", invalidClientIdPresent: false });
  });

  it("accepts valid uuid", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseMessagesLogClientId(id, false)).toEqual({ clientId: id, invalidClientIdPresent: false });
  });

  it("returns invalid flag for non-uuid string", () => {
    expect(parseMessagesLogClientId("not-a-uuid", false)).toEqual({
      clientId: "",
      invalidClientIdPresent: true,
    });
  });

  it("treats empty as no filter", () => {
    expect(parseMessagesLogClientId("", false)).toEqual({ clientId: "", invalidClientIdPresent: false });
    expect(parseMessagesLogClientId(undefined, false)).toEqual({ clientId: "", invalidClientIdPresent: false });
  });
});
