import { describe, expect, it } from "vitest";
import { testSetUsageHasAnyReference, testSetUsageSections } from "./testSetUsageSummaryText";
import { EMPTY_TEST_SET_USAGE_SNAPSHOT } from "@/modules/tests/types";

describe("testSetUsageSummaryText", () => {
  it("testSetUsageHasAnyReference is false for empty snapshot", () => {
    expect(testSetUsageHasAnyReference({ ...EMPTY_TEST_SET_USAGE_SNAPSHOT })).toBe(false);
  });

  it("includes test_attempts_history when counter positive", () => {
    const sections = testSetUsageSections({
      ...EMPTY_TEST_SET_USAGE_SNAPSHOT,
      testAttemptsRecordedCount: 4,
    });
    expect(sections.some((s) => s.key === "test_attempts_history")).toBe(true);
  });
});
