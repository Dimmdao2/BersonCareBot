import { describe, expect, it } from "vitest";
import {
  maskContactHint,
  maskEmailForContactHint,
  maskPhoneForContactHint,
} from "./maskContactHint";

describe("maskContactHint", () => {
  it("masks email local part", () => {
    expect(maskEmailForContactHint("user@example.com")).toBe("u***@example.com");
  });

  it("masks phone via health archive pattern", () => {
    expect(maskPhoneForContactHint("+79991234567")).toBe("+•••4567");
  });

  it("passes oauth provider label through", () => {
    expect(maskContactHint("oauth_provider", "google")).toBe("google");
  });
});
