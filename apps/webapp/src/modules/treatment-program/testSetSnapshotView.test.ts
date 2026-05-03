import { describe, expect, it } from "vitest";
import { parseTestSetSnapshotTests } from "./testSetSnapshotView";

describe("parseTestSetSnapshotTests", () => {
  it("returns empty for missing or non-array tests", () => {
    expect(parseTestSetSnapshotTests({})).toEqual([]);
    expect(parseTestSetSnapshotTests({ tests: null })).toEqual([]);
    expect(parseTestSetSnapshotTests({ tests: "x" as unknown as string })).toEqual([]);
  });

  it("parses legacy rows without comment key", () => {
    expect(
      parseTestSetSnapshotTests({
        tests: [{ testId: "a1", title: "T1", sortOrder: 0 }],
      }),
    ).toEqual([{ testId: "a1", title: "T1", comment: null }]);
  });

  it("trims comment and drops blank", () => {
    expect(
      parseTestSetSnapshotTests({
        tests: [
          { testId: "b1", title: "T2", comment: "  hi  " },
          { testId: "b2", title: null, comment: "   " },
        ],
      }),
    ).toEqual([
      { testId: "b1", title: "T2", comment: "hi" },
      { testId: "b2", title: null, comment: null },
    ]);
  });
});
