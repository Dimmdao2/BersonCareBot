import { describe, expect, it } from "vitest";
import {
  ITEM_DONE_COOLDOWN_MS,
  formatPlanItemDoneCooldownCaption,
  isItemDoneCooldownActive,
  itemDoneCooldownMinutesRemaining,
} from "./itemDoneCooldown";

describe("itemDoneCooldown", () => {
  it("freezes within 1h after last done", () => {
    const now = Date.parse("2026-05-10T12:00:00.000Z");
    const last = "2026-05-10T11:30:00.000Z";
    expect(isItemDoneCooldownActive(last, now)).toBe(true);
    expect(itemDoneCooldownMinutesRemaining(last, now)).toBe(30);
    expect(formatPlanItemDoneCooldownCaption(30)).toMatch(/Снова через/);
  });

  it("unlocks after cooldown window", () => {
    const now = Date.parse("2026-05-10T13:01:00.000Z");
    const last = "2026-05-10T12:00:00.000Z";
    expect(isItemDoneCooldownActive(last, now)).toBe(false);
    expect(itemDoneCooldownMinutesRemaining(last, now)).toBeNull();
  });

  it("exports one hour window", () => {
    expect(ITEM_DONE_COOLDOWN_MS).toBe(3_600_000);
  });
});
