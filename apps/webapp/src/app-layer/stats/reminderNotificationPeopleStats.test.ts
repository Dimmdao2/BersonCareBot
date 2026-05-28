import { describe, expect, it } from "vitest";
import {
  aggregateReminderPeopleChannelSegments,
  classifyReminderDeliveryChannelSegment,
} from "./reminderNotificationPeopleStats";

describe("classifyReminderDeliveryChannelSegment", () => {
  it("returns no_channel when nothing active", () => {
    expect(
      classifyReminderDeliveryChannelSegment({ hasPush: false, hasTelegram: false, hasMax: false }),
    ).toBe("no_channel");
  });

  it("returns only_* for single channel", () => {
    expect(
      classifyReminderDeliveryChannelSegment({ hasPush: true, hasTelegram: false, hasMax: false }),
    ).toBe("only_push");
    expect(
      classifyReminderDeliveryChannelSegment({ hasPush: false, hasTelegram: true, hasMax: false }),
    ).toBe("only_telegram");
    expect(
      classifyReminderDeliveryChannelSegment({ hasPush: false, hasTelegram: false, hasMax: true }),
    ).toBe("only_max");
  });

  it("returns multiple when more than one channel", () => {
    expect(
      classifyReminderDeliveryChannelSegment({ hasPush: true, hasTelegram: true, hasMax: false }),
    ).toBe("multiple");
  });
});

describe("aggregateReminderPeopleChannelSegments", () => {
  it("counts mutually exclusive segments", () => {
    const slices = aggregateReminderPeopleChannelSegments([
      { hasPush: true, hasTelegram: false, hasMax: false },
      { hasPush: true, hasTelegram: true, hasMax: false },
      { hasPush: false, hasTelegram: false, hasMax: false },
    ]);
    expect(slices).toEqual([
      { segment: "only_push", label: "Только Push", peopleCount: 1 },
      { segment: "multiple", label: "Несколько каналов", peopleCount: 1 },
      { segment: "no_channel", label: "Нет канала", peopleCount: 1 },
    ]);
  });
});
