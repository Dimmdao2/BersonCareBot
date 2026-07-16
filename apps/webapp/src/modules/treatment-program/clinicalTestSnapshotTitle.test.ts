import { describe, expect, it } from "vitest";
import { clinicalTestTitleFromInstanceSnapshot } from "./clinicalTestSnapshotTitle";

describe("clinicalTestTitleFromInstanceSnapshot", () => {
  it("returns the matching historical test title", () => {
    expect(
      clinicalTestTitleFromInstanceSnapshot(
        {
          itemType: "clinical_test",
          tests: [
            { testId: "test-a", title: "  Стабильность плеча  " },
            { testId: "test-b", title: "Баланс" },
          ],
        },
        "test-a",
      ),
    ).toBe("Стабильность плеча");
  });

  it("supports the legacy top-level clinical-test snapshot", () => {
    expect(
      clinicalTestTitleFromInstanceSnapshot({ id: "test-a", title: "Подвижность" }, "test-a"),
    ).toBe("Подвижность");
  });

  it("fails closed when the snapshot does not contain the requested test", () => {
    expect(
      clinicalTestTitleFromInstanceSnapshot(
        { tests: [{ testId: "test-b", title: "Другой тест" }] },
        "test-a",
      ),
    ).toBeNull();
  });
});
