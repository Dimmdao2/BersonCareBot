import { describe, expect, it } from "vitest";
import { parseTestSetItemsPayloadJson } from "./actionsShared";

describe("parseTestSetItemsPayloadJson", () => {
  it("maps array order to sortOrder and trims comments", () => {
    const id1 = "11111111-1111-4111-8111-111111111111";
    const id2 = "22222222-2222-4222-8222-222222222222";
    const raw = JSON.stringify([
      { testId: id1, comment: "  a  " },
      { testId: id2, comment: null },
    ]);
    const out = parseTestSetItemsPayloadJson(raw);
    expect(out).toEqual([
      { testId: id1, sortOrder: 0, comment: "a" },
      { testId: id2, sortOrder: 1, comment: null },
    ]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseTestSetItemsPayloadJson("{")).toThrow(/JSON/);
  });
});
