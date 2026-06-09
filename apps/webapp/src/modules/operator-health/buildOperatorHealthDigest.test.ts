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
      degradedLines: [],
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
      degradedLines: [],
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
      degradedLines: [],
      suppressRecovery: false,
    });
    expect(result.lines.some((l) => l.includes("Восстановлено: max / probe_outbound"))).toBe(true);
  });

  it("suppresses recovery after manual resolve-all in window", () => {
    const result = buildOperatorHealthDigest({
      auditErrorCount: 0,
      incidentsOpened: [],
      incidentsResolved: [{ integration: "max", errorClass: "probe_outbound" }],
      jobFailures: [],
      degradedLines: [],
      suppressRecovery: true,
    });
    expect(result.lines.some((l) => l.startsWith("Восстановлено:"))).toBe(false);
  });
});
