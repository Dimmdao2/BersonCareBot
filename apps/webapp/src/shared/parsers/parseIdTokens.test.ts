import { describe, expect, it } from "vitest";
import { parseIdTokens } from "./parseIdTokens";

describe("parseIdTokens", () => {
  it("parses free-form delimiters", () => {
    expect(parseIdTokens("123 456,789;900\n111")).toEqual(["123", "456", "789", "900", "111"]);
  });

  it("parses JSON arrays", () => {
    expect(parseIdTokens('["123", "456", "123"]')).toEqual(["123", "456"]);
  });

  it("parses arrays from unknown input", () => {
    expect(parseIdTokens(["a", "b", "a", 123])).toEqual(["a", "b", "123"]);
  });

  it("returns empty for empty values", () => {
    expect(parseIdTokens("")).toEqual([]);
    expect(parseIdTokens("   ")).toEqual([]);
    expect(parseIdTokens(null)).toEqual([]);
  });

  it("parses JSON string payloads", () => {
    expect(parseIdTokens('"one two,three"')).toEqual(["one", "two", "three"]);
  });
});
