import { describe, expect, it } from "vitest";
import {
  formatPlanItemDoneCooldownCaption,
  isItemDoneCooldownActive,
  itemDoneCooldownMinutesRemaining,
  planItemDoneRepeatCooldownMsFromMinutes,
} from "./itemDoneCooldown";

const ONE_HOUR_MS = 60 * 60_000;

describe("itemDoneCooldown", () => {
  it("freezes within cooldown after last done", () => {
    const now = Date.parse("2026-05-10T12:00:00.000Z");
    const last = "2026-05-10T11:30:00.000Z";
    expect(isItemDoneCooldownActive(last, ONE_HOUR_MS, now)).toBe(true);
    expect(itemDoneCooldownMinutesRemaining(last, ONE_HOUR_MS, now)).toBe(30);
    expect(formatPlanItemDoneCooldownCaption(30)).toMatch(/Снова через/);
  });

  it("unlocks after cooldown window", () => {
    const now = Date.parse("2026-05-10T13:01:00.000Z");
    const last = "2026-05-10T12:00:00.000Z";
    expect(isItemDoneCooldownActive(last, ONE_HOUR_MS, now)).toBe(false);
    expect(itemDoneCooldownMinutesRemaining(last, ONE_HOUR_MS, now)).toBeNull();
  });

  it("planItemDoneRepeatCooldownMsFromMinutes", () => {
    expect(planItemDoneRepeatCooldownMsFromMinutes(60)).toBe(3_600_000);
  });
});
