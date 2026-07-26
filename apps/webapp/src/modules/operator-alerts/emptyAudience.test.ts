import { describe, expect, it } from "vitest";
import {
  EMPTY_EMPTY_AUDIENCE_COUNTER,
  classifyEmptyAudienceSignal,
  isDestinationPresent,
  mergeEmptyAudienceCounter,
  parseEmptyAudienceCounter,
  selectPresentDestinations,
  type EmptyAudienceEvent,
} from "./emptyAudience";

const NOW = Date.parse("2026-07-26T12:00:00.000Z");

const OPERATIONAL: EmptyAudienceEvent = {
  topic: "notify_doctor_program_note",
  severity: "operational",
  channels: ["telegram", "max"],
};

describe("mergeEmptyAudienceCounter", () => {
  it("counts monotonically and remembers where it last happened", () => {
    const first = mergeEmptyAudienceCounter(
      { ...EMPTY_EMPTY_AUDIENCE_COUNTER, byTopic: {} },
      OPERATIONAL,
      "2026-07-26T11:00:00.000Z",
    );
    const second = mergeEmptyAudienceCounter(first, OPERATIONAL, "2026-07-26T11:30:00.000Z");
    expect(second.total).toBe(2);
    expect(second.operationalTotal).toBe(2);
    expect(second.userFacingTotal).toBe(0);
    expect(second.byTopic.notify_doctor_program_note).toBe(2);
    expect(second.lastAt).toBe("2026-07-26T11:30:00.000Z");
    expect(second.lastTopic).toBe("notify_doctor_program_note");
  });

  it("separates operational from user-facing totals", () => {
    const merged = mergeEmptyAudienceCounter(
      { ...EMPTY_EMPTY_AUDIENCE_COUNTER, byTopic: {} },
      { topic: "broadcast_web_push_no_vapid", severity: "user_facing", channels: ["web_push"] },
      "2026-07-26T11:00:00.000Z",
    );
    expect(merged.operationalTotal).toBe(0);
    expect(merged.userFacingTotal).toBe(1);
  });

  it("survives a corrupt or absent stored counter", () => {
    expect(parseEmptyAudienceCounter(undefined).total).toBe(0);
    expect(parseEmptyAudienceCounter("nonsense").total).toBe(0);
    expect(parseEmptyAudienceCounter({ total: "x", byTopic: 5 }).total).toBe(0);
  });
});

describe("classifyEmptyAudienceSignal", () => {
  it("fires while an event sits inside the window — the counter alerts on itself", () => {
    const counter = mergeEmptyAudienceCounter(
      { ...EMPTY_EMPTY_AUDIENCE_COUNTER, byTopic: {} },
      OPERATIONAL,
      "2026-07-26T11:40:00.000Z",
    );
    const signal = classifyEmptyAudienceSignal(counter, NOW);
    expect(signal.active).toBe(true);
    expect(signal.total).toBe(1);
    expect(signal.topTopics[0]).toEqual({ topic: "notify_doctor_program_note", count: 1 });
  });

  it("goes quiet once the last event fell out of the window", () => {
    const counter = mergeEmptyAudienceCounter(
      { ...EMPTY_EMPTY_AUDIENCE_COUNTER, byTopic: {} },
      OPERATIONAL,
      "2026-07-26T09:00:00.000Z",
    );
    expect(classifyEmptyAudienceSignal(counter, NOW).active).toBe(false);
  });

  it("is silent on a never-used counter", () => {
    expect(classifyEmptyAudienceSignal({ ...EMPTY_EMPTY_AUDIENCE_COUNTER, byTopic: {} }, NOW).active).toBe(
      false,
    );
  });
});

describe("isDestinationPresent", () => {
  it("counts an unverified destination as ABSENT", () => {
    expect(
      isDestinationPresent({ channel: "email", address: "a@example.com", verifiedAt: null }, NOW),
    ).toBe(false);
  });

  it("counts a bounce-suppressed destination as ABSENT until the suppression expires", () => {
    const base = { channel: "email", address: "a@example.com", verifiedAt: "2026-07-01T00:00:00.000Z" };
    expect(isDestinationPresent({ ...base, suppressedUntil: "2026-08-02T00:00:00.000Z" }, NOW)).toBe(false);
    expect(isDestinationPresent({ ...base, suppressedUntil: "2026-07-20T00:00:00.000Z" }, NOW)).toBe(true);
  });

  it("counts a blank address as ABSENT", () => {
    expect(
      isDestinationPresent({ channel: "email", address: "   ", verifiedAt: "2026-07-01T00:00:00.000Z" }, NOW),
    ).toBe(false);
  });

  it("selects only present destinations", () => {
    const present = selectPresentDestinations(
      [
        { channel: "email", address: "ok@example.com", verifiedAt: "2026-07-01T00:00:00.000Z" },
        { channel: "email", address: "unverified@example.com", verifiedAt: null },
        {
          channel: "email",
          address: "bounced@example.com",
          verifiedAt: "2026-07-01T00:00:00.000Z",
          suppressedUntil: "2026-08-02T00:00:00.000Z",
        },
      ],
      NOW,
    );
    expect(present.map((d) => d.address)).toEqual(["ok@example.com"]);
  });
});
