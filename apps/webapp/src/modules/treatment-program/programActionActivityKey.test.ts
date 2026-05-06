import { describe, expect, it } from "vitest";
import { programActionDoneActivityKey } from "./programActionActivityKey";

describe("programActionDoneActivityKey", () => {
  it("normalizes exercise and test ids to lowercase for stable aggregation keys", () => {
    const item = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(programActionDoneActivityKey(item, { exerciseId: "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB" })).toBe(
      `${item}:ex:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
    );
    expect(programActionDoneActivityKey(item, { testId: "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC" })).toBe(
      `${item}:test:cccccccc-cccc-4ccc-8ccc-cccccccccccc`,
    );
  });
});
