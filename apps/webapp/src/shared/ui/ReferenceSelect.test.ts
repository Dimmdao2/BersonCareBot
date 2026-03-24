import { describe, expect, it } from "vitest";
import { ReferenceSelect } from "./ReferenceSelect";

describe("ReferenceSelect", () => {
  it("exports a client component function", () => {
    expect(typeof ReferenceSelect).toBe("function");
  });
});
