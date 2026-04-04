import { describe, expect, it } from "vitest";
import {
  classifyHistoricalRubitimeTiming,
  coerceNonEmptyString,
  deriveCompatSlotEnd,
  extractIntegratorBranchIdFromPayload,
  extractRubitimePayloadWallEnd,
  extractRubitimePayloadWallStart,
  isNaiveWallClockString,
  naiveWallAsEtcUtcInstant,
} from "./historicalTimeBackfillLogic.js";

describe("historicalTimeBackfillLogic", () => {
  const cutoff = new Date("2026-04-10T00:00:00.000Z");
  const before = new Date("2026-04-01T00:00:00.000Z");

  it("extracts wall start/end and branch id from rubitime payload_json shape", () => {
    const payload = { record: "2026-04-07 11:00:00", branch_id: "17356", datetime_end: "2026-04-07 12:00:00" };
    expect(extractRubitimePayloadWallStart(payload)).toBe("2026-04-07 11:00:00");
    expect(extractRubitimePayloadWallEnd(payload)).toBe("2026-04-07 12:00:00");
    expect(extractIntegratorBranchIdFromPayload(payload)).toBe("17356");
  });

  it("coerceNonEmptyString trims and rejects empty", () => {
    expect(coerceNonEmptyString("  x  ")).toBe("x");
    expect(coerceNonEmptyString("")).toBeNull();
    expect(coerceNonEmptyString(1)).toBeNull();
  });

  it("detects naive wall clock", () => {
    expect(isNaiveWallClockString("2026-04-07 11:00:00")).toBe(true);
    expect(isNaiveWallClockString("2026-04-07T11:00:00")).toBe(true);
    expect(isNaiveWallClockString("2026-04-07T11:00:00Z")).toBe(false);
  });

  it("naiveWallAsEtcUtcInstant matches Etc/UTC interpretation", () => {
    expect(naiveWallAsEtcUtcInstant("2026-04-07 11:00:00")).toBe("2026-04-07T11:00:00.000Z");
  });

  it("classify: skips on or after cutoff", () => {
    const r = classifyHistoricalRubitimeTiming({
      payloadJson: { record: "2026-04-07 11:00:00" },
      recordAtDb: new Date("2026-04-07T08:00:00.000Z"),
      branchTimezone: "Europe/Moscow",
      cutoffExclusive: cutoff,
      rowCreatedAt: new Date("2026-04-10T12:00:00.000Z"),
      requireUtcMisinterpretationMatch: true,
    });
    expect(r).toEqual({ kind: "skip", reason: "on_or_after_cutoff" });
  });

  it("classify: fix misinterpreted UTC row (MSK wall → wrong UTC storage)", () => {
    const r = classifyHistoricalRubitimeTiming({
      payloadJson: { record: "2026-04-07 11:00:00" },
      recordAtDb: new Date("2026-04-07T11:00:00.000Z"),
      branchTimezone: "Europe/Moscow",
      cutoffExclusive: cutoff,
      rowCreatedAt: before,
      requireUtcMisinterpretationMatch: true,
    });
    expect(r.kind).toBe("fix_misinterpreted_utc");
    if (r.kind === "fix_misinterpreted_utc") {
      expect(r.newRecordAt).toBe("2026-04-07T08:00:00.000Z");
    }
  });

  it("classify: restore null record_at when raw naive exists", () => {
    const r = classifyHistoricalRubitimeTiming({
      payloadJson: { record: "2026-04-07 11:00:00" },
      recordAtDb: null,
      branchTimezone: "Europe/Moscow",
      cutoffExclusive: cutoff,
      rowCreatedAt: before,
      requireUtcMisinterpretationMatch: true,
    });
    expect(r.kind).toBe("restore_null_record_at");
    if (r.kind === "restore_null_record_at") {
      expect(r.newRecordAt).toBe("2026-04-07T08:00:00.000Z");
    }
  });

  it("classify: skip when already matches branch-normalized instant", () => {
    const r = classifyHistoricalRubitimeTiming({
      payloadJson: { record: "2026-04-07 11:00:00" },
      recordAtDb: new Date("2026-04-07T08:00:00.000Z"),
      branchTimezone: "Europe/Moscow",
      cutoffExclusive: cutoff,
      rowCreatedAt: before,
      requireUtcMisinterpretationMatch: true,
    });
    expect(r).toEqual({ kind: "skip", reason: "already_correct" });
  });

  it("classify: unresolved when branch timezone is not a valid IANA id", () => {
    const r = classifyHistoricalRubitimeTiming({
      payloadJson: { record: "2026-04-07 11:00:00" },
      recordAtDb: new Date("2026-04-07T11:00:00.000Z"),
      branchTimezone: "NotA/RealZone",
      cutoffExclusive: cutoff,
      rowCreatedAt: before,
      requireUtcMisinterpretationMatch: true,
    });
    expect(r.kind).toBe("unresolved");
    if (r.kind === "unresolved") {
      expect(r.rawRecordAt).toBe("2026-04-07 11:00:00");
      expect(r.branchTimezone).toBe("NotA/RealZone");
      expect(r.failureReason).toBe("invalid_timezone");
    }
  });

  it("classify: skip stored_not_matching when require match and DB instant is not naive-as-UTC misread", () => {
    const r = classifyHistoricalRubitimeTiming({
      payloadJson: { record: "2026-04-07 11:00:00" },
      recordAtDb: new Date("2026-04-07T09:00:00.000Z"),
      branchTimezone: "Europe/Moscow",
      cutoffExclusive: cutoff,
      rowCreatedAt: before,
      requireUtcMisinterpretationMatch: true,
    });
    expect(r).toEqual({ kind: "skip", reason: "stored_not_matching_naive_as_utc_pattern" });
  });

  it("deriveCompatSlotEnd preserves duration when end iso missing", () => {
    const end = deriveCompatSlotEnd({
      oldSlotStart: new Date("2026-04-07T11:00:00.000Z"),
      oldSlotEnd: new Date("2026-04-07T12:00:00.000Z"),
      newSlotStartIso: "2026-04-07T08:00:00.000Z",
      newSlotEndIso: null,
    });
    expect(end).toBe("2026-04-07T09:00:00.000Z");
  });
});
