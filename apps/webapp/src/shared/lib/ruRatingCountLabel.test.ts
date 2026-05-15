import { describe, expect, it } from "vitest";
import { ruRatingCountLabel } from "./ruRatingCountLabel";

describe("ruRatingCountLabel", () => {
  it("handles 1, 2–4, 5–20, 21 and 11–14", () => {
    expect(ruRatingCountLabel(1)).toBe("оценка");
    expect(ruRatingCountLabel(2)).toBe("оценки");
    expect(ruRatingCountLabel(4)).toBe("оценки");
    expect(ruRatingCountLabel(5)).toBe("оценок");
    expect(ruRatingCountLabel(11)).toBe("оценок");
    expect(ruRatingCountLabel(12)).toBe("оценок");
    expect(ruRatingCountLabel(21)).toBe("оценка");
    expect(ruRatingCountLabel(22)).toBe("оценки");
    expect(ruRatingCountLabel(25)).toBe("оценок");
  });
});
