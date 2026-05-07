/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import type { PatientHomeTodayLayoutBlock } from "./PatientHomeTodayLayout";
import {
  insertMoodBetweenUsefulPostAndBooking,
  insertSosBookingSplitAfterMood,
  prependPlanBlock,
  reorderPatientHomeLayoutBlocks,
} from "./patientHomeTodayLayoutOrder";

function b(code: PatientHomeTodayLayoutBlock["code"]): PatientHomeTodayLayoutBlock {
  return { code, node: null };
}

describe("patientHomeTodayLayoutOrder", () => {
  it("prepends plan block when present", () => {
    const out = prependPlanBlock([
      b("daily_warmup"),
      b("useful_post"),
      b("plan"),
      b("booking"),
    ]);
    expect(out.map((x) => x.code)).toEqual(["plan", "daily_warmup", "useful_post", "booking"]);
  });

  it("inserts mood after useful_post when both post and booking exist", () => {
    const out = insertMoodBetweenUsefulPostAndBooking([
      b("daily_warmup"),
      b("useful_post"),
      b("booking"),
      b("mood_checkin"),
      b("situations"),
    ]);
    expect(out.map((x) => x.code)).toEqual([
      "daily_warmup",
      "useful_post",
      "mood_checkin",
      "booking",
      "situations",
    ]);
  });

  it("inserts mood before booking when useful_post is absent", () => {
    const out = insertMoodBetweenUsefulPostAndBooking([b("daily_warmup"), b("booking"), b("mood_checkin")]);
    expect(out.map((x) => x.code)).toEqual(["daily_warmup", "mood_checkin", "booking"]);
  });

  it("inserts sos_booking_split immediately after mood_checkin", () => {
    const split = { code: "sos_booking_split" as const, node: null };
    const out = insertSosBookingSplitAfterMood(
      [b("daily_warmup"), b("mood_checkin"), b("situations")],
      split,
    );
    expect(out.map((x) => x.code)).toEqual(["daily_warmup", "mood_checkin", "sos_booking_split", "situations"]);
  });

  it("inserts sos_booking_split at end when mood_checkin is absent", () => {
    const split = { code: "sos_booking_split" as const, node: null };
    const out = insertSosBookingSplitAfterMood([b("daily_warmup"), b("situations")], split);
    expect(out.map((x) => x.code)).toEqual(["daily_warmup", "situations", "sos_booking_split"]);
  });

  it("applies plan-first then mood placement", () => {
    const out = reorderPatientHomeLayoutBlocks([
      b("daily_warmup"),
      b("useful_post"),
      b("booking"),
      b("mood_checkin"),
      b("plan"),
      b("situations"),
    ]);
    expect(out.map((x) => x.code)).toEqual([
      "plan",
      "daily_warmup",
      "useful_post",
      "mood_checkin",
      "booking",
      "situations",
    ]);
  });
});
