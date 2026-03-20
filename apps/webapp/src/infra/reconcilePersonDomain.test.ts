import { describe, expect, it } from "vitest";
import { buildReport, isWithinThreshold } from "./reconcilePersonDomain";

describe("reconcilePersonDomain", () => {
  it("buildReport classifies missingInWebapp and extraInWebapp", () => {
    const legacy = new Map<string, import("./reconcilePersonDomain").LegacyUser>([
      [
        "1",
        {
          integratorUserId: "1",
          phone: "+7999",
          displayName: "A",
          bindings: [{ channelCode: "telegram", externalId: "t1" }],
          topics: { notify_spb: true },
        },
      ],
      [
        "2",
        {
          integratorUserId: "2",
          phone: null,
          displayName: "",
          bindings: [],
          topics: {} as Record<string, boolean>,
        },
      ],
    ]);
    const target = new Map<string, import("./reconcilePersonDomain").TargetUser>([
      [
        "1",
        {
          platformUserId: "uuid-1",
          integratorUserId: "1",
          phone: "+7999",
          displayName: "A",
          bindings: [{ channelCode: "telegram", externalId: "t1" }],
          topics: { notify_spb: true },
        },
      ],
      [
        "3",
        {
          platformUserId: "uuid-3",
          integratorUserId: "3",
          phone: "+7888",
          displayName: "C",
          bindings: [],
          topics: {} as Record<string, boolean>,
        },
      ],
    ]);
    const report = buildReport(legacy, target, 5);
    expect(report.totalLegacyUsers).toBe(2);
    expect(report.totalProjectedWithIntegratorId).toBe(2);
    expect(report.missingInWebappCount).toBe(1);
    expect(report.missingInWebappIds).toContain("2");
    expect(report.extraInWebappCount).toBe(1);
    expect(report.extraInWebappIds).toContain("3");
    expect(report.fieldDriftCount).toBe(0);
    expect(report.sampledComparison).toHaveLength(1);
  });

  it("buildReport detects field drift", () => {
    const legacy = new Map([
      [
        "1",
        {
          integratorUserId: "1",
          phone: "+7999",
          displayName: "Alice",
          bindings: [{ channelCode: "telegram", externalId: "t1" }],
          topics: { notify_spb: true },
        },
      ],
    ]);
    const target = new Map([
      [
        "1",
        {
          platformUserId: "uuid-1",
          integratorUserId: "1",
          phone: "+7999",
          displayName: "Bob",
          bindings: [{ channelCode: "telegram", externalId: "t1" }],
          topics: { notify_spb: true },
        },
      ],
    ]);
    const report = buildReport(legacy, target, 5);
    expect(report.fieldDriftCount).toBe(1);
    expect(report.fieldDriftSample[0].displayNameMatch).toBe(false);
    expect(report.fieldDriftSample[0].phoneMatch).toBe(true);
  });

  it("isWithinThreshold returns false when missing > 0 and maxMismatchPercent is 0", () => {
    const report = {
      totalLegacyUsers: 10,
      totalProjectedWithIntegratorId: 9,
      missingInWebappCount: 1,
      missingInWebappIds: ["1"],
      extraInWebappCount: 0,
      extraInWebappIds: [],
      fieldDriftCount: 0,
      fieldDriftSample: [],
      sampledComparison: [],
    };
    expect(isWithinThreshold(report, 0)).toBe(false);
    expect(isWithinThreshold(report, 10)).toBe(true);
  });

  it("isWithinThreshold returns true when totalLegacy is 0", () => {
    const report = {
      totalLegacyUsers: 0,
      totalProjectedWithIntegratorId: 0,
      missingInWebappCount: 0,
      missingInWebappIds: [],
      extraInWebappCount: 0,
      extraInWebappIds: [],
      fieldDriftCount: 0,
      fieldDriftSample: [],
      sampledComparison: [],
    };
    expect(isWithinThreshold(report, 0)).toBe(true);
  });
});
