import { describe, expect, it } from "vitest";
import { getPurchaseSectionState } from "./service";

describe("purchases service", () => {
  it("returns title and description", () => {
    const state = getPurchaseSectionState();
    expect(state).toHaveProperty("title");
    expect(state).toHaveProperty("description");
    expect(state.title).toBe("Мои покупки");
  });
});
