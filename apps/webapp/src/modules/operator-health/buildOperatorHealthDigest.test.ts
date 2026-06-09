import { describe, expect, it } from "vitest";
import {
  buildOperatorHealthDigest,
  MAX_OPERATOR_HEALTH_DIGEST_LINES,
  OPERATOR_HEALTH_DIGEST_LINK,
} from "./buildOperatorHealthDigest";

describe("buildOperatorHealthDigest", () => {
  it("returns ✅ when window has no issues", () => {
    const result = buildOperatorHealthDigest({
      auditErrorCount: 0,
      incidentsOpened: [],
      incidentsResolved: [],
      jobFailures: [],
      snapshotLines: [],
      suppressRecovery: false,
    });
    expect(result.icon).toBe("✅");
    expect(result.hasIssues).toBe(false);
    expect(result.lines[0]).toBe("✅ Всё в порядке");
    expect(result.lines.at(-1)).toBe(OPERATOR_HEALTH_DIGEST_LINK);
    expect(result.lines.length).toBeLessThanOrEqual(MAX_OPERATOR_HEALTH_DIGEST_LINES);
  });

  it("returns ⚠️ when audit log has errors in window", () => {
    const result = buildOperatorHealthDigest({
      auditErrorCount: 2,
      incidentsOpened: [],
      incidentsResolved: [],
      jobFailures: [],
      snapshotLines: [],
      suppressRecovery: false,
    });
    expect(result.icon).toBe("⚠️");
    expect(result.hasIssues).toBe(true);
    expect(result.lines.some((l) => l.includes("Ошибки в журнале админки: 2"))).toBe(true);
  });

  it("includes recovery line when incident resolved in window", () => {
    const result = buildOperatorHealthDigest({
      auditErrorCount: 0,
      incidentsOpened: [],
      incidentsResolved: [{ integration: "max", errorClass: "probe_outbound" }],
      jobFailures: [],
      snapshotLines: [],
      suppressRecovery: false,
    });
    expect(result.lines.some((l) => l.includes("Восстановлено за окно:"))).toBe(true);
    expect(result.lines.some((l) => l.includes("max / probe_outbound"))).toBe(true);
  });

  it("suppresses recovery after manual resolve-all in window", () => {
    const result = buildOperatorHealthDigest({
      auditErrorCount: 0,
      incidentsOpened: [],
      incidentsResolved: [{ integration: "max", errorClass: "probe_outbound" }],
      jobFailures: [],
      snapshotLines: [],
      suppressRecovery: true,
    });
    expect(result.lines.some((l) => l.includes("Восстановлено за окно:"))).toBe(false);
    expect(result.lines.some((l) => l.includes("max / probe_outbound"))).toBe(false);
  });

  it("includes incidents opened and job failures in window", () => {
    const result = buildOperatorHealthDigest({
      auditErrorCount: 0,
      incidentsOpened: [{ integration: "rubitime", errorClass: "probe_failed" }],
      incidentsResolved: [],
      jobFailures: [{ jobFamily: "health", jobKey: "health.operator_health_critical.tick", lastFailureAt: "x" }],
      snapshotLines: [],
      suppressRecovery: false,
    });
    expect(result.lines.some((l) => l.includes("Инцидент: rubitime"))).toBe(true);
    expect(result.lines.some((l) => l.includes("health.operator_health_critical.tick"))).toBe(true);
  });

  it("truncates detail lines to MAX minus header and link", () => {
    const result = buildOperatorHealthDigest({
      auditErrorCount: 0,
      incidentsOpened: [],
      incidentsResolved: [],
      jobFailures: [],
      snapshotLines: Array.from({ length: 20 }, (_, i) => `line-${i}`),
      suppressRecovery: false,
    });
    expect(result.lines.length).toBeLessThanOrEqual(MAX_OPERATOR_HEALTH_DIGEST_LINES);
    expect(result.lines[0]).toMatch(/^⚠️/);
    expect(result.lines.at(-1)).toBe(OPERATOR_HEALTH_DIGEST_LINK);
    const detailCount = result.lines.length - 2;
    expect(detailCount).toBe(MAX_OPERATOR_HEALTH_DIGEST_LINES - 2);
  });
});
